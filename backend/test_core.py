"""Tests for the parts of the backend that don't need FastAPI: python -m unittest test_core -v"""
import os
import tempfile
import unittest

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="anwe-test-")

import store  # noqa: E402
from db import init_db  # noqa: E402
from files import parse_range  # noqa: E402
from security import RateLimiter, hash_password, hash_token, password_problem, verify_password  # noqa: E402


class SecurityTests(unittest.TestCase):
    def test_password_roundtrip(self):
        h = hash_password("Sup3r-secret")
        self.assertTrue(verify_password("Sup3r-secret", h))
        self.assertFalse(verify_password("sup3r-secret", h))
        self.assertNotIn("Sup3r", h)
        self.assertFalse(verify_password("x", None))
        self.assertFalse(verify_password("x", "scrypt$00$00"))

    def test_password_rules(self):
        self.assertTrue(password_problem("short1A"))
        self.assertTrue(password_problem("alllowercase"))
        self.assertEqual(password_problem("Passw0rdOK"), "")

    def test_rate_limiter(self):
        r = RateLimiter(limit=3, window=60)
        self.assertEqual([r.allow("k") for _ in range(4)], [True, True, True, False])
        r.reset("k")
        self.assertTrue(r.allow("k"))

    def test_token_hash_is_stable(self):
        self.assertEqual(hash_token("a"), hash_token("a"))
        self.assertNotEqual(hash_token("a"), hash_token("b"))


class RangeTests(unittest.TestCase):
    def test_ranges(self):
        self.assertIsNone(parse_range(None, 100))
        self.assertEqual(parse_range("bytes=0-9", 100), (0, 9))
        self.assertEqual(parse_range("bytes=90-", 100), (90, 99))
        self.assertEqual(parse_range("bytes=50-500", 100), (50, 99))
        self.assertEqual(parse_range("bytes=-10", 100), (90, 99))
        self.assertEqual(parse_range("bytes=-500", 100), (0, 99))
        self.assertEqual(parse_range("bytes=100-", 100), "invalid")
        self.assertEqual(parse_range("bytes=9-3", 100), "invalid")
        self.assertEqual(parse_range("bytes=0-1", 0), "invalid")
        self.assertIsNone(parse_range("garbage", 100))


class StoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def make_user(self, email):
        return store.create_user("Test", email, password_hash=hash_password("Passw0rd!"))

    def test_sessions(self):
        u = self.make_user("s@example.com")
        token = store.create_session(u["id"], 1)
        self.assertEqual(store.user_for_session(token)["id"], u["id"])
        store.delete_session(token)
        self.assertIsNone(store.user_for_session(token))
        self.assertIsNone(store.user_for_session("nope"))
        self.assertIsNone(store.user_for_session(None))

    def test_unique_email_case_insensitive(self):
        self.make_user("Dup@Example.com")
        self.assertIsNotNone(store.get_user_by_email("dup@example.COM"))
        with self.assertRaises(Exception):
            self.make_user("dup@example.com")

    def test_reset_token_single_use_and_logs_out(self):
        u = self.make_user("r@example.com")
        session = store.create_session(u["id"], 1)
        token = store.create_reset_token(u["id"], 30)
        self.assertEqual(store.consume_reset_token(token), u["id"])
        self.assertIsNone(store.consume_reset_token(token))
        store.set_password(u["id"], hash_password("NewPassw0rd!"))
        self.assertIsNone(store.user_for_session(session))

    def test_project_ownership_and_lifecycle(self):
        a, b = self.make_user("a@example.com"), self.make_user("b@example.com")
        pid = "a" * 32
        folder = store.project_dir(a["id"], pid)
        folder.mkdir(parents=True)
        (folder / "video.mp4").write_bytes(b"123")
        p = store.create_project(a["id"], "My talk", 12.5, "video.mp4", "video/mp4", pid)
        self.assertEqual(p["status"], "draft")
        # another user can't see, rename, save to or delete it
        self.assertEqual(store.list_projects(b["id"]), [])
        self.assertIsNone(store.get_project_row(b["id"], pid))
        self.assertIsNone(store.rename_project(b["id"], pid, "hacked"))
        self.assertFalse(store.save_transcript(b["id"], pid, [], None))
        self.assertIsNone(store.save_edit_state(b["id"], pid, {"x": 1}))
        self.assertFalse(store.delete_project(b["id"], pid))
        self.assertIsNone(store.duplicate_project(b["id"], pid))
        # owner can
        segs = [{"start": 0, "end": 1, "text": "hello"}]
        self.assertTrue(store.save_transcript(a["id"], pid, segs, 20))
        self.assertEqual(store.project_detail(a["id"], pid)["status"], "ready")
        self.assertIsNotNone(store.save_edit_state(a["id"], pid, {"v": 2, "key": "k"}))
        detail = store.project_detail(a["id"], pid)
        self.assertEqual(detail["editState"]["key"], "k")
        self.assertEqual(detail["transcript"], segs)
        self.assertEqual(detail["videoUrl"], f"/projects/{pid}/video")
        # new transcript clears saved cuts
        store.save_transcript(a["id"], pid, segs, None)
        self.assertIsNone(store.project_detail(a["id"], pid)["editState"])
        copy = store.duplicate_project(a["id"], pid)
        self.assertEqual(copy["name"], "My talk (copy)")
        self.assertTrue((store.project_dir(a["id"], copy["projectId"]) / "video.mp4").exists())
        self.assertEqual(len(store.list_projects(a["id"])), 2)
        self.assertTrue(store.delete_project(a["id"], pid))
        self.assertFalse(folder.exists())
        self.assertEqual(len(store.list_projects(a["id"])), 1)


if __name__ == "__main__":
    unittest.main()
