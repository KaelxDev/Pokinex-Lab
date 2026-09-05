from datetime import datetime, timezone

import app.infrastructure.database as database
from app.repositories.message_repository import save_message


def _prepare_database(tmp_path, monkeypatch):
    db_path = tmp_path / "messages.db"
    monkeypatch.setattr(database, "SQLITE_DB_PATH", db_path)
    database.initialize_database()
    connection = database.get_connection()
    try:
        created_at = datetime.now(timezone.utc).isoformat()
        connection.execute(
            "INSERT INTO users "
            "(username, password_hash, password_salt, display_name, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("kael", "hash", "salt", "Kael", created_at),
        )
        connection.commit()
    finally:
        connection.close()


def test_save_message_reports_new_and_duplicate_inserts(tmp_path, monkeypatch):
    _prepare_database(tmp_path, monkeypatch)
    created_at = datetime.now(timezone.utc).isoformat()

    assert save_message("message-1", 1, "Olá", created_at) is True
    assert save_message("message-1", 1, "Olá novamente", created_at) is False

    connection = database.get_connection()
    try:
        rows = connection.execute(
            "SELECT message_id, message FROM messages WHERE message_id = ?",
            ("message-1",),
        ).fetchall()
        assert [(row["message_id"], row["message"]) for row in rows] == [
            ("message-1", "Olá")
        ]
    finally:
        connection.close()
