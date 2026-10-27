def _register(client, **over):
    data = {"username": "asha", "full_name": "Asha", "email": "Asha@Example.com", "phone": "+919000000001",
            "password": "abc12345", **over}
    return client.post("/auth/register", json=data)


def test_validation(client):
    assert _register(client, password="short").status_code == 422
    assert _register(client, password="onlyletters").status_code == 422
    assert _register(client, phone="98765").status_code == 422
    assert _register(client, username="bad name!").status_code == 422


def test_signup_needs_both_otps_then_login_works(client):
    reg = _register(client).json()
    uid, codes = reg["user_id"], reg["dev_codes"]
    assert reg["email"] == "asha@example.com" and set(codes) == {"email", "sms"}
    assert _register(client, username="other", phone="+919000000002").json()["detail"] == "Email is already registered"

    r = client.post("/auth/login", json={"identifier": "asha", "password": "abc12345"})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "unverified"

    assert client.post("/auth/verify", json={"user_id": uid, "channel": "email", "code": "000000"}).status_code == 400
    r = client.post("/auth/verify", json={"user_id": uid, "channel": "email", "code": codes["email"]}).json()
    assert r["email_verified"] and not r["phone_verified"] and r["token"] is None
    r = client.post("/auth/verify", json={"user_id": uid, "channel": "sms", "code": codes["sms"]}).json()
    assert r["token"]["user"]["phone_verified"]

    for ident in ("asha", "asha@example.com", "+919000000001", "+91 90000 00001"):
        assert client.post("/auth/login", json={"identifier": ident, "password": "abc12345"}).status_code == 200
    assert client.post("/auth/login", json={"identifier": "asha", "password": "wrong123"}).status_code == 401


def test_resend_invalidates_previous_code(client):
    reg = _register(client, username="ravi", email="ravi@example.com", phone="+919000000003").json()
    new = client.post("/auth/resend", json={"user_id": reg["user_id"], "channel": "sms"}).json()["dev_code"]
    if new != reg["dev_codes"]["sms"]:
        old = client.post("/auth/verify", json={"user_id": reg["user_id"], "channel": "sms",
                                                "code": reg["dev_codes"]["sms"]})
        assert old.status_code == 400
    assert client.post("/auth/verify", json={"user_id": reg["user_id"], "channel": "sms", "code": new}).status_code == 200


def test_attempt_limit(client):
    reg = _register(client, username="meera", email="meera@example.com", phone="+919000000004").json()
    for _ in range(5):
        client.post("/auth/verify", json={"user_id": reg["user_id"], "channel": "email", "code": "999999"})
    r = client.post("/auth/verify", json={"user_id": reg["user_id"], "channel": "email",
                                          "code": reg["dev_codes"]["email"]})
    assert r.status_code == 429


def test_otp_login_and_password_reset(client, verified_user):
    _, creds = verified_user
    code = client.post("/auth/otp/request", json={"identifier": creds["phone"]}).json()["dev_code"]
    assert client.post("/auth/otp/login", json={"identifier": creds["phone"], "code": code}).status_code == 200

    unknown = client.post("/auth/otp/request", json={"identifier": "nobody@example.com"}).json()
    assert unknown["dev_code"] is None and "If an account exists" in unknown["message"]

    code = client.post("/auth/otp/request", json={"identifier": creds["email"], "purpose": "reset"}).json()["dev_code"]
    r = client.post("/auth/password/reset",
                    json={"identifier": creds["email"], "code": code, "new_password": "newpass99"})
    assert r.status_code == 200
    assert client.post("/auth/login", json={"identifier": creds["username"], "password": "newpass99"}).status_code == 200
