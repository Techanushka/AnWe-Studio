"""
End-to-end check of a RUNNING backend using only the standard library.

    1) start the server:   uvicorn main:app --port 8000
    2) in another window:  python smoke_test.py            (or: python smoke_test.py http://localhost:8000)

It creates two throw-away accounts and walks through signup, login, uploading a project, streaming the video
(including Range requests used for seeking), saving edits, renaming, duplicating, deleting, and checks that one
user can never see another user's project.
"""
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
failures = []


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, method, path, body=None, headers=None, raw=None):
        data, hdrs = raw, dict(headers or {})
        if body is not None:
            data, hdrs["Content-Type"] = json.dumps(body).encode(), "application/json"
        req = urllib.request.Request(BASE + path, data=data, method=method, headers=hdrs)
        try:
            with self.opener.open(req, timeout=30) as r:
                payload = r.read()
                return r.status, payload, dict(r.headers)
        except urllib.error.HTTPError as e:
            return e.code, e.read(), dict(e.headers)

    def json(self, method, path, body=None):
        status, payload, _ = self.call(method, path, body)
        try:
            return status, json.loads(payload or b"{}")
        except ValueError:
            return status, {}


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    out = b""
    for k, v in fields.items():
        out += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (filename, ctype, content) in files.items():
        out += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{filename}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + content + b"\r\n"
    return out + f"--{boundary}--\r\n".encode(), {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}" + (f"   ({detail})" if detail and not ok else ""))
    if not ok:
        failures.append(label)


def main():
    print(f"Testing {BASE}\n")
    a, b = Client(), Client()
    email_a, email_b = f"a{uuid.uuid4().hex[:8]}@example.com", f"b{uuid.uuid4().hex[:8]}@example.com"
    pw = "Passw0rd!x"

    s, d = a.json("GET", "/health"); check("server is up (/health)", s == 200 and d.get("ok"), s)
    s, _ = a.json("GET", "/auth/me"); check("not logged in -> /auth/me is 401", s == 401, s)
    s, _ = a.json("GET", "/projects"); check("not logged in -> /projects is 401", s == 401, s)

    s, d = a.json("POST", "/auth/signup", {"name": "Alex Test", "email": email_a, "password": "short"}); check("weak password rejected", s == 400, s)
    s, d = a.json("POST", "/auth/signup", {"name": "Alex Test", "email": email_a, "password": pw}); check("signup works", s in (200, 201) and d.get("user", {}).get("email") == email_a, (s, d))
    s, d = a.json("GET", "/auth/me"); check("signup logs you in (/auth/me)", s == 200 and d["user"]["name"] == "Alex Test", (s, d))
    s, _ = a.json("POST", "/auth/signup", {"name": "Dup", "email": email_a.upper(), "password": pw}); check("duplicate email -> 409", s == 409, s)
    s, _ = a.json("POST", "/auth/logout", {}); check("logout works", s == 200, s)
    s, _ = a.json("GET", "/auth/me"); check("after logout -> 401", s == 401, s)
    s, _ = a.json("POST", "/auth/login", {"email": email_a, "password": "wrong-Passw0rd"}); check("wrong password -> 401", s == 401, s)
    s, d = a.json("POST", "/auth/login", {"email": email_a, "password": pw, "remember": True}); check("login works", s == 200, (s, d))

    video = b"\x00\x00\x00\x18ftypmp42" + bytes(range(256)) * 12   # not a real video, just bytes the server stores
    transcript = [{"start": 0, "end": 2.5, "text": "Hello there"}, {"start": 2.5, "end": 5, "text": "welcome"}]
    body, hdr = multipart({"name": "Smoke test", "duration": "5", "transcript": json.dumps(transcript)},
                          {"video": ("clip.mp4", "video/mp4", video), "thumbnail": ("t.jpg", "image/jpeg", b"\xff\xd8\xff\xd9")})
    s, payload, _ = a.call("POST", "/projects", headers=hdr, raw=body)
    d = json.loads(payload or b"{}")
    pid = d.get("project", {}).get("projectId")
    check("upload a project (video + transcript + thumbnail)", s in (200, 201) and bool(pid), (s, d))
    check("project with a transcript is 'ready'", d.get("project", {}).get("status") == "ready", d)
    if not pid:
        return

    body, hdr = multipart({"name": "bad"}, {"video": ("notes.txt", "text/plain", b"hello")})
    s, _, _ = a.call("POST", "/projects", headers=hdr, raw=body); check("non-video upload rejected (415)", s == 415, s)

    s, d = a.json("GET", "/projects"); check("project list has the new project", s == 200 and any(p["projectId"] == pid for p in d.get("projects", [])), (s, d))
    s, d = a.json("GET", f"/projects/{pid}"); p = d.get("project", {})
    check("project detail has videoUrl + transcript", s == 200 and p.get("videoUrl") and len(p.get("transcript") or []) == 2, (s, d))

    s, payload, h = a.call("GET", f"/projects/{pid}/video"); check("video streams back unchanged", s == 200 and payload == video, (s, len(payload)))
    s, payload, h = a.call("GET", f"/projects/{pid}/video", headers={"Range": "bytes=10-19"})
    check("Range request works (seeking)", s == 206 and payload == video[10:20] and "Content-Range" in {k.title(): v for k, v in h.items()}, (s, len(payload)))
    s, payload, _ = a.call("GET", f"/projects/{pid}/thumbnail"); check("thumbnail is served", s == 200 and len(payload) > 0, s)

    state = {"v": 2, "key": "k1", "index": 1, "nextId": 3, "entries": []}
    s, d = a.json("PUT", f"/projects/{pid}/state", state); check("save edit state", s == 200 and d.get("stateUpdatedAt"), (s, d))
    s, d = a.json("GET", f"/projects/{pid}"); check("edit state comes back", d.get("project", {}).get("editState", {}).get("key") == "k1", d)
    s, d = a.json("PUT", f"/projects/{pid}/transcript", {"segments": transcript, "duration": 5}); check("save transcript", s == 200, (s, d))
    s, d = a.json("PATCH", f"/projects/{pid}", {"name": "Renamed"}); check("rename", s == 200 and d.get("project", {}).get("name") == "Renamed", (s, d))
    s, d = a.json("POST", f"/projects/{pid}/duplicate", {}); copy_id = d.get("project", {}).get("projectId")
    check("duplicate", s in (200, 201) and copy_id and d["project"]["name"] == "Renamed (copy)", (s, d))

    s, d = b.json("POST", "/auth/signup", {"name": "Other User", "email": email_b, "password": pw}); check("second account created", s in (200, 201), s)
    s, d = b.json("GET", "/projects"); check("other user sees none of these projects", s == 200 and d.get("projects") == [], d)
    for label, method, path, body_ in [("read", "GET", f"/projects/{pid}", None), ("rename", "PATCH", f"/projects/{pid}", {"name": "x"}),
                                       ("delete", "DELETE", f"/projects/{pid}", None), ("save state", "PUT", f"/projects/{pid}/state", state)]:
        s, _ = b.json(method, path, body_); check(f"other user can't {label} someone else's project (404)", s == 404, s)
    s, _, _ = b.call("GET", f"/projects/{pid}/video"); check("other user can't download the video (404)", s == 404, s)

    s, _ = a.json("DELETE", f"/projects/{pid}"); check("delete", s == 200, s)
    s, _ = a.json("GET", f"/projects/{pid}"); check("deleted project is gone (404)", s == 404, s)
    if copy_id:
        a.json("DELETE", f"/projects/{copy_id}")
    s, d = a.json("GET", "/exports"); check("/exports answers", s == 200 and "exports" in d, (s, d))


try:
    main()
except urllib.error.URLError as e:
    print(f"\nCould not reach {BASE}: {e.reason}\nIs the backend running? (uvicorn main:app --port 8000)")
    sys.exit(2)
print("\n" + ("ALL CHECKS PASSED" if not failures else f"{len(failures)} CHECK(S) FAILED: " + "; ".join(failures)))
sys.exit(1 if failures else 0)
