from datetime import datetime, timezone

import app.auth as auth
import app.database as database
from app.avatar_storage import get_avatar, store_avatar


def _create_user(connection, username="kael"):
    created_at = datetime.now(timezone.utc).isoformat()
    connection.execute(
        "INSERT INTO users "
        "(username, password_hash, password_salt, display_name, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (username, "hash", "salt", "Kael", created_at),
    )
    connection.commit()


def test_avatar_roundtrip_persists_binary_content(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(database, "SQLITE_DB_PATH", db_path)
    database.initialize_database()

    connection = database.get_connection()
    try:
        _create_user(connection)
    finally:
        connection.close()

    content = b"fake-image-bytes"
    path = store_avatar(1, content, "image/png")

    assert path == "/api/auth/avatar/1"
    assert get_avatar(1) == (content, "image/png")


def test_avatar_update_replaces_previous_content(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(database, "SQLITE_DB_PATH", db_path)
    database.initialize_database()

    connection = database.get_connection()
    try:
        _create_user(connection)
    finally:
        connection.close()

    store_avatar(1, b"first", "image/jpeg")
    store_avatar(1, b"second", "image/webp")

    assert get_avatar(1) == (b"second", "image/webp")


def test_auth_returns_persistent_avatar_reference(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(database, "SQLITE_DB_PATH", db_path)
    database.initialize_database()

    password_hash, password_salt = auth.hash_password("senha-forte-123")
    connection = database.get_connection()
    try:
        created_at = datetime.now(timezone.utc).isoformat()
        connection.execute(
            "INSERT INTO users "
            "(username, password_hash, password_salt, display_name, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("kael", password_hash, password_salt, "Kael", created_at),
        )
        connection.commit()
    finally:
        connection.close()

    store_avatar(1, b"avatar", "image/png")

    user = auth.authenticate("kael", "senha-forte-123")

    assert user is not None
    assert user["avatar"].startswith("/api/auth/avatar/1?v=")


def test_missing_avatar_ignores_stale_avatar_routes(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(database, "SQLITE_DB_PATH", db_path)
    database.initialize_database()

    connection = database.get_connection()
    try:
        _create_user(connection)
        connection.execute(
            "UPDATE users SET avatar = ? WHERE id = 1",
            ("/api/auth/avatar/1",),
        )
        connection.commit()
        avatar = database._persistent_avatar_reference(
            connection,
            1,
            "/api/auth/avatar/1",
        )
    finally:
        connection.close()

    assert avatar == ""
