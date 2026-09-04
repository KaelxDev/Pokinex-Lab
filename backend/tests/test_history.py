from datetime import datetime, timedelta, timezone

import app.database as database
from app.message_history import get_message_history


def _prepare_database(tmp_path, monkeypatch):
    db_path = tmp_path / "history.db"
    monkeypatch.setattr(database, "SQLITE_DB_PATH", db_path)
    database.initialize_database()
    return db_path


def test_message_history_returns_newest_page_in_display_order(tmp_path, monkeypatch):
    _prepare_database(tmp_path, monkeypatch)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)

    connection = database.get_connection()
    try:
        connection.execute(
            "INSERT INTO users (username, password_hash, password_salt, display_name, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("kael", "hash", "salt", "Kael", base.isoformat()),
        )
        for index in range(1, 5):
            connection.execute(
                "INSERT INTO messages (message_id, user_id, message, created_at) VALUES (?, ?, ?, ?)",
                (
                    f"message-{index}",
                    1,
                    f"Mensagem {index}",
                    (base + timedelta(minutes=index)).isoformat(),
                ),
            )
        connection.commit()
    finally:
        connection.close()

    page = get_message_history(limit=2)

    assert [item["messageId"] for item in page["messages"]] == ["message-3", "message-4"]
    assert page["hasMore"] is True
    assert page["nextBefore"] == page["messages"][0]["timestamp"]


def test_message_history_before_cursor_loads_older_messages(tmp_path, monkeypatch):
    _prepare_database(tmp_path, monkeypatch)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)

    connection = database.get_connection()
    try:
        connection.execute(
            "INSERT INTO users (username, password_hash, password_salt, display_name, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("kael", "hash", "salt", "Kael", base.isoformat()),
        )
        for index in range(1, 5):
            connection.execute(
                "INSERT INTO messages (message_id, user_id, message, created_at) VALUES (?, ?, ?, ?)",
                (
                    f"message-{index}",
                    1,
                    f"Mensagem {index}",
                    (base + timedelta(minutes=index)).isoformat(),
                ),
            )
        connection.commit()
    finally:
        connection.close()

    first_page = get_message_history(limit=2)
    older_page = get_message_history(limit=2, before=first_page["nextBefore"])

    assert [item["messageId"] for item in older_page["messages"]] == ["message-1", "message-2"]
    assert older_page["hasMore"] is False
    assert older_page["nextBefore"] is None
