from datetime import datetime, timezone

from app.repositories.user_repository import (
    create_user_record,
    get_user_credentials_by_username,
    get_user_profile_by_id,
    update_user_record,
)
from app.infrastructure.database import get_connection


def _prepare_db(tmp_path, monkeypatch):
    import app.infrastructure.database as database

    monkeypatch.setattr(database, "SQLITE_DB_PATH", tmp_path / "users.db")
    database.initialize_database()


def test_user_repository_crud_roundtrip(tmp_path, monkeypatch):
    _prepare_db(tmp_path, monkeypatch)
    created_at = datetime.now(timezone.utc).isoformat()

    user_id = create_user_record("kael", "hash", "salt", created_at)
    assert user_id == 1

    credentials = get_user_credentials_by_username("KAEL")
    assert credentials["username"] == "kael"

    profile = get_user_profile_by_id(user_id)
    assert profile["displayName"] == "kael"

    updated = update_user_record(user_id, "kael2", "Kael", "", "Online")
    assert updated["username"] == "kael2"
    assert updated["displayName"] == "Kael"
    assert updated["status"] == "Online"

    connection = get_connection()
    try:
        row = connection.execute("SELECT username FROM users WHERE id = 1").fetchone()
        assert row["username"] == "kael2"
    finally:
        connection.close()
