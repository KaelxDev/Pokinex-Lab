from datetime import datetime, timezone

import app.database as database


def _prepare_database(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setattr(database, "SQLITE_DB_PATH", db_path)
    database.initialize_database()
    return db_path


def test_initialize_database_creates_and_records_migrations(tmp_path, monkeypatch):
    _prepare_database(tmp_path, monkeypatch)

    database.initialize_database()

    connection = database.get_connection()
    try:
        rows = connection.execute(
            "SELECT version, name FROM schema_migrations ORDER BY version"
        ).fetchall()
        versions = [(row["version"], row["name"]) for row in rows]

        assert versions == [
            (1, "baseline_schema"),
            (2, "message_metadata"),
            (3, "persistent_avatars"),
            (4, "message_history_index"),
        ]

        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(messages)").fetchall()
        }
        assert {"deleted_at", "reply_to_message_id"}.issubset(columns)

        avatar_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(user_avatars)").fetchall()
        }
        assert {"user_id", "content", "content_type", "updated_at"}.issubset(avatar_columns)
    finally:
        connection.close()


def test_toggle_reaction_is_atomic_for_sequential_toggles(tmp_path, monkeypatch):
    _prepare_database(tmp_path, monkeypatch)
    created_at = datetime.now(timezone.utc).isoformat()

    connection = database.get_connection()
    try:
        connection.execute(
            "INSERT INTO users "
            "(username, password_hash, password_salt, display_name, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("kael", "hash", "salt", "Kael", created_at),
        )
        connection.execute(
            "INSERT INTO messages (message_id, user_id, message, created_at) "
            "VALUES (?, ?, ?, ?)",
            ("message-1", 1, "Olá", created_at),
        )
        connection.commit()
    finally:
        connection.close()

    active, counts = database.toggle_reaction("message-1", 1, "❤️", created_at)
    assert active is True
    assert counts == {"❤️": 1}

    active, counts = database.toggle_reaction("message-1", 1, "❤️", created_at)
    assert active is False
    assert counts == {}
