
"""Data access for users, sessions and projects."""
import json
import shutil
import uuid
from datetime import datetime, timedelta, timezone

from config import UPLOAD_DIR
from db import connect
from security import hash_token, new_token
import cloud_storage


def now() -> str:
    return datetime.now(timezone.utc).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")


def _future(**kw) -> str:
    return (datetime.now(timezone.utc) + timedelta(**kw)).isoformat(
        timespec="seconds"
    ).replace("+00:00", "Z")


# ---------- users ----------

def create_user(
    name: str,
    email: str,
    password_hash: str | None = None,
    google_sub: str | None = None,
    avatar_url: str | None = None,
) -> dict:
    uid = uuid.uuid4().hex
    with connect() as c:
        c.execute(
            """INSERT INTO users
            (id,email,name,password_hash,google_sub,avatar_url,created_at)
            VALUES (?,?,?,?,?,?,?)""",
            (uid, email.lower(), name, password_hash, google_sub, avatar_url, now()),
        )
    return get_user(uid)


def get_user(uid: str) -> dict | None:
    with connect() as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> dict | None:
    with connect() as c:
        row = c.execute(
            "SELECT * FROM users WHERE email=?", (email.lower(),)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_google(sub: str) -> dict | None:
    with connect() as c:
        row = c.execute(
            "SELECT * FROM users WHERE google_sub=?", (sub,)
        ).fetchone()
    return dict(row) if row else None


def set_password(uid: str, password_hash: str) -> None:
    with connect() as c:
        c.execute("UPDATE users SET password_hash=? WHERE id=?", (password_hash, uid))
        c.execute("DELETE FROM sessions WHERE user_id=?", (uid,))


def link_google(uid: str, sub: str, avatar_url: str | None) -> None:
    with connect() as c:
        c.execute(
            "UPDATE users SET google_sub=?, avatar_url=COALESCE(?,avatar_url) WHERE id=?",
            (sub, avatar_url, uid),
        )


def public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "avatarUrl": user.get("avatar_url") or "",
    }


# ---------- sessions & reset tokens ----------

def create_session(uid: str, days: int) -> str:
    token = new_token()
    with connect() as c:
        c.execute("DELETE FROM sessions WHERE expires_at < ?", (now(),))
        c.execute(
            """INSERT INTO sessions
            (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)""",
            (hash_token(token), uid, _future(days=days), now()),
        )
    return token


def user_for_session(token: str | None) -> dict | None:
    if not token:
        return None
    with connect() as c:
        row = c.execute(
            """SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=? AND s.expires_at > ?""",
            (hash_token(token), now()),
        ).fetchone()
    return dict(row) if row else None


def delete_session(token: str | None) -> None:
    if token:
        with connect() as c:
            c.execute("DELETE FROM sessions WHERE token_hash=?", (hash_token(token),))


def create_reset_token(uid: str, minutes: int) -> str:
    token = new_token()
    with connect() as c:
        c.execute("DELETE FROM reset_tokens WHERE user_id=?", (uid,))
        c.execute(
            """INSERT INTO reset_tokens (token_hash,user_id,expires_at)
            VALUES (?,?,?)""",
            (hash_token(token), uid, _future(minutes=minutes)),
        )
    return token


def consume_reset_token(token: str) -> str | None:
    with connect() as c:
        row = c.execute(
            "SELECT user_id FROM reset_tokens WHERE token_hash=? AND expires_at > ?",
            (hash_token(token), now()),
        ).fetchone()
        if not row:
            return None
        c.execute("DELETE FROM reset_tokens WHERE token_hash=?", (hash_token(token),))
    return row["user_id"]


# ---------- projects ----------

def project_dir(uid: str, pid: str):
    return UPLOAD_DIR / uid / pid


def _status(row) -> str:
    return "ready" if row["transcript"] else "draft"


def serialize_project(row) -> dict:
    pid = row["id"]
    return {
        "projectId": pid,
        "name": row["name"],
        "duration": row["duration"],
        "status": _status(row),
        "thumbnail": f"/projects/{pid}/thumbnail" if row["thumbnail_file"] else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def list_projects(uid: str) -> list[dict]:
    with connect() as c:
        rows = c.execute(
            "SELECT * FROM projects WHERE user_id=? ORDER BY updated_at DESC",
            (uid,),
        ).fetchall()
    return [serialize_project(row) for row in rows]


def get_project_row(uid: str, pid: str):
    with connect() as c:
        return c.execute(
            "SELECT * FROM projects WHERE id=? AND user_id=?",
            (pid, uid),
        ).fetchone()


def project_detail(uid: str, pid: str) -> dict | None:
    row = get_project_row(uid, pid)
    if not row:
        return None

    data = serialize_project(row)
    data["videoUrl"] = f"/projects/{pid}/video" if row["video_file"] else None
    data["transcript"] = json.loads(row["transcript"]) if row["transcript"] else None
    data["editState"] = json.loads(row["edit_state"]) if row["edit_state"] else None
    data["stateUpdatedAt"] = row["state_updated_at"]
    return data


def create_project(
    uid: str,
    name: str,
    duration: float | None,
    video_file: str,
    video_type: str,
    pid: str,
    thumbnail_file: str | None = None,
    transcript: list | None = None,
) -> dict:
    ts = now()
    with connect() as c:
        c.execute(
            """INSERT INTO projects
            (id,user_id,name,duration,video_file,video_type,thumbnail_file,
             transcript,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (
                pid, uid, name, duration, video_file, video_type, thumbnail_file,
                json.dumps(transcript) if transcript else None, ts, ts,
            ),
        )
    return serialize_project(get_project_row(uid, pid))


def rename_project(uid: str, pid: str, name: str) -> dict | None:
    with connect() as c:
        cur = c.execute(
            "UPDATE projects SET name=?, updated_at=? WHERE id=? AND user_id=?",
            (name, now(), pid, uid),
        )
    return serialize_project(get_project_row(uid, pid)) if cur.rowcount else None


def save_transcript(
    uid: str, pid: str, transcript: list, duration: float | None
) -> bool:
    with connect() as c:
        cur = c.execute(
            """UPDATE projects SET transcript=?, edit_state=NULL,
            state_updated_at=NULL, duration=COALESCE(?,duration), updated_at=?
            WHERE id=? AND user_id=?""",
            (json.dumps(transcript), duration, now(), pid, uid),
        )
    return bool(cur.rowcount)


def save_edit_state(uid: str, pid: str, state: dict) -> str | None:
    ts = now()
    with connect() as c:
        cur = c.execute(
            """UPDATE projects SET edit_state=?, state_updated_at=?, updated_at=?
            WHERE id=? AND user_id=?""",
            (json.dumps(state), ts, ts, pid, uid),
        )
    return ts if cur.rowcount else None


def _copy_project_file(
    uid: str,
    old_pid: str,
    new_pid: str,
    stored_name: str | None,
) -> str | None:
    """Copy one cloud object or one legacy local file for a duplicate project."""
    if not stored_name:
        return None

    if cloud_storage.is_cloud_file(stored_name):
        old_key = cloud_storage.cloud_key(stored_name)
        filename = old_key.rsplit("/", 1)[-1]
        new_key = f"{uid}/{new_pid}/{filename}"
        cloud_storage.copy_cloud_file(old_key, new_key)
        return cloud_storage.cloud_ref(new_key)

    src = project_dir(uid, old_pid) / stored_name
    if not src.is_file():
        return stored_name

    dst_dir = project_dir(uid, new_pid)
    dst_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst_dir / stored_name)
    return stored_name


def duplicate_project(uid: str, pid: str) -> dict | None:
    src = get_project_row(uid, pid)
    if not src:
        return None

    new_id = uuid.uuid4().hex
    video_file = None
    thumbnail_file = None

    try:
        video_file = _copy_project_file(uid, pid, new_id, src["video_file"])
        thumbnail_file = _copy_project_file(uid, pid, new_id, src["thumbnail_file"])

        ts = now()
        with connect() as c:
            c.execute(
                """INSERT INTO projects
                (id,user_id,name,duration,video_file,video_type,thumbnail_file,
                 transcript,edit_state,created_at,updated_at,state_updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    new_id, uid, f"{src['name']} (copy)", src["duration"],
                    video_file, src["video_type"], thumbnail_file, src["transcript"],
                    src["edit_state"], ts, ts, src["state_updated_at"],
                ),
            )
    except Exception:
        cloud_paths = [
            cloud_storage.cloud_key(value)
            for value in (video_file, thumbnail_file)
            if cloud_storage.is_cloud_file(value)
        ]
        try:
            cloud_storage.delete_cloud_files(cloud_paths)
        except Exception:
            pass
        shutil.rmtree(project_dir(uid, new_id), ignore_errors=True)
        raise

    return serialize_project(get_project_row(uid, new_id))


def delete_project(uid: str, pid: str) -> bool:
    row = get_project_row(uid, pid)
    if not row:
        return False

    # Delete only cloud objects owned by this project.
    cloud_paths = [
        cloud_storage.cloud_key(value)
        for value in (row["video_file"], row["thumbnail_file"])
        if cloud_storage.is_cloud_file(value)
    ]
    if cloud_paths:
        cloud_storage.delete_cloud_files(cloud_paths)

    with connect() as c:
        cur = c.execute(
            "DELETE FROM projects WHERE id=? AND user_id=?",
            (pid, uid),
        )

    if cur.rowcount:
        shutil.rmtree(project_dir(uid, pid), ignore_errors=True)

    return bool(cur.rowcount)
