PW = "Str0ng!Pass"
NEW_PW = "N3w!Passw0rd"


def test_full_flow(client, mailbox):
    body = {"name": "Alex", "email": "Alex@Example.com", "password": PW}

    assert client.post("/auth/signup", json={**body, "password": "weak"}).status_code == 422
    r = client.post("/auth/signup", json=body)
    assert r.status_code == 201 and r.json()["requires_verification"]
    assert client.post("/auth/signup", json=body).status_code == 429  # OTP cooldown

    r = client.post("/auth/login", json={"email": "alex@example.com", "password": PW})
    assert r.status_code == 403 and r.json()["code"] == "EMAIL_NOT_VERIFIED"

    assert client.post("/auth/verify-otp", json={"email": "alex@example.com", "code": "000000"}).status_code == 400
    r = client.post("/auth/verify-otp", json={"email": "alex@example.com", "code": mailbox["otp"]})
    assert r.status_code == 200 and r.json()["user"]["is_verified"]
    assert client.get("/auth/me").json()["email"] == "alex@example.com"

    client.post("/auth/logout")
    assert client.get("/auth/me").status_code == 401

    r = client.post("/auth/login", json={"email": "alex@example.com", "password": "Wrong!pass1"})
    assert r.status_code == 401 and "message" in r.json()
    assert client.post("/auth/login", json={"email": "alex@example.com", "password": PW, "remember": True}).status_code == 200
    assert client.get("/auth/me").status_code == 200

    # forgot -> reset
    assert client.post("/auth/forgot-password", json={"email": "nobody@example.com"}).status_code == 200
    assert "token" not in mailbox
    assert client.post("/auth/forgot-password", json={"email": "alex@example.com"}).status_code == 200
    r = client.post("/auth/reset-password", json={"token": mailbox["token"], "password": NEW_PW})
    assert r.status_code == 200
    assert client.post("/auth/reset-password", json={"token": mailbox["token"], "password": NEW_PW}).status_code == 400

    client.cookies.clear()
    assert client.post("/auth/login", json={"email": "alex@example.com", "password": PW}).status_code == 401
    assert client.post("/auth/login", json={"email": "alex@example.com", "password": NEW_PW}).status_code == 200

    # change password
    assert client.post("/auth/change-password", json={"current_password": "bad", "new_password": PW}).status_code == 400
    assert client.post("/auth/change-password", json={"current_password": NEW_PW, "new_password": PW}).status_code == 200


def test_lockout(client, mailbox):
    client.post("/auth/signup", json={"name": "A", "email": "a@b.co", "password": PW})
    client.post("/auth/verify-otp", json={"email": "a@b.co", "code": mailbox["otp"]})
    client.post("/auth/logout")
    for _ in range(5):
        client.post("/auth/login", json={"email": "a@b.co", "password": "Wrong!pass1"})
    r = client.post("/auth/login", json={"email": "a@b.co", "password": PW})
    assert r.status_code == 429
