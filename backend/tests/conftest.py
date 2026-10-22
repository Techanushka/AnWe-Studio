import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-test-secret-key-1234")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")

import mongomock
import pytest
from fastapi.testclient import TestClient

from app.db import mongo
from app.main import app
from app.services import email_service


@pytest.fixture()
def client(monkeypatch):
    fake_db = mongomock.MongoClient()["anwe_test"]  # in-memory, no Atlas needed for tests
    monkeypatch.setattr(mongo, "get_database", lambda: fake_db)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def mailbox(monkeypatch):
    box = {}
    monkeypatch.setattr(email_service, "send_verification_otp", lambda e, n, code: box.update(otp=code))
    monkeypatch.setattr(
        email_service, "send_password_reset", lambda e, n, link: box.update(token=link.split("token=")[1])
    )
    monkeypatch.setattr(email_service, "send_password_changed", lambda e, n: box.update(changed=True))
    return box
