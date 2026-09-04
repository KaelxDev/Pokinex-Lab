import app.auth as auth


def test_password_roundtrip(monkeypatch):
    monkeypatch.setattr(auth, "PASSWORD_ITERATIONS", 1_000)

    password_hash, password_salt = auth.hash_password("senha-forte-123")

    assert auth.verify_password("senha-forte-123", password_hash, password_salt)
    assert not auth.verify_password("senha-incorreta", password_hash, password_salt)


def test_password_parameters_remain_strong():
    assert auth.PASSWORD_ITERATIONS >= 600_000
    assert len(bytes.fromhex(auth.hash_password("senha-forte-123")[1])) == 16


def test_validate_credentials():
    assert auth.validate_credentials("kael_123", "senha-forte-123")[0] == "kael_123"
    assert auth.validate_credentials("ka", "senha-forte-123")[1]
    assert auth.validate_credentials("kael", "curta")[1]
    assert auth.validate_credentials("kael!", "senha-forte-123")[1]


def test_validate_username():
    assert auth.validate_username("Kael_123")[0] == "Kael_123"
    assert auth.validate_username("ka")[1]
    assert auth.validate_username("kael!")[1]
