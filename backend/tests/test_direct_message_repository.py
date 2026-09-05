from datetime import datetime, timedelta, timezone

import app.infrastructure.database as database
from app.repositories.direct_message_repository import (
    delete_direct_message,
    get_direct_message,
    get_direct_message_history,
    save_direct_message,
    toggle_direct_reaction,
    update_direct_message,
)


def _prepare_database(tmp_path, monkeypatch):
    db_path = tmp_path / "direct.db"
    monkeypatch.setattr(database, "SQLITE_DB_PATH", db_path)
    database.initialize_database()

    connection = database.get_connection()
    created_at = datetime.now(timezone.utc).isoformat()
    try:
        connection.execute(
            "INSERT INTO users "
            "(username, password_hash, password_salt, display_name, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("kael", "hash", "salt", "Kael", created_at),
        )
        connection.execute(
            "INSERT INTO users "
            "(username, password_hash, password_salt, display_name, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("maria", "hash", "salt", "Maria", created_at),
        )
        connection.commit()
    finally:
        connection.close()


def test_save_direct_message_is_idempotent(tmp_path, monkeypatch):
    _prepare_database(tmp_path, monkeypatch)
    created_at = datetime.now(timezone.utc).isoformat()

    assert save_direct_message("dm-1", 1, 2, "Olá", created_at) is True
    assert save_direct_message("dm-1", 1, 2, "Olá novamente", created_at) is False

    message = get_direct_message("dm-1")
    assert message["message"] == "Olá"


def test_direct_message_history_supports_reply_and_cursor(tmp_path, monkeypatch):
    _prepare_database(tmp_path, monkeypatch)
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)

    save_direct_message("dm-1", 1, 2, "Primeira", (base + timedelta(minutes=1)).isoformat())
    save_direct_message(
        "dm-2",
        2,
        1,
        "Resposta",
        (base + timedelta(minutes=2)).isoformat(),
        reply_to_message_id="dm-1",
    )
    save_direct_message("dm-3", 1, 2, "Terceira", (base + timedelta(minutes=3)).isoformat())

    page = get_direct_message_history(1, 2, limit=2)

    assert [item["messageId"] for item in page["messages"]] == ["dm-2", "dm-3"]
    assert page["hasMore"] is True
    assert page["messages"][0]["replyTo"]["messageId"] == "dm-1"

    older = get_direct_message_history(1, 2, limit=2, before=page["nextBefore"])
    assert [item["messageId"] for item in older["messages"]] == ["dm-1"]
    assert older["hasMore"] is False


def test_direct_message_update_and_delete_are_author_scoped(tmp_path, monkeypatch):
    _prepare_database(tmp_path, monkeypatch)
    created_at = datetime.now(timezone.utc).isoformat()
    save_direct_message("dm-1", 1, 2, "Original", created_at)

    edited_at = datetime.now(timezone.utc).isoformat()
    assert update_direct_message("dm-1", 2, "Não permitido", edited_at) is False
    assert update_direct_message("dm-1", 1, "Editada", edited_at) is True
    assert get_direct_message("dm-1")["message"] == "Editada"

    deleted_at = datetime.now(timezone.utc).isoformat()
    assert delete_direct_message("dm-1", 2, deleted_at) is False
    assert delete_direct_message("dm-1", 1, deleted_at) is True

    message = get_direct_message("dm-1")
    assert message["deleted"] is True
    assert message["message"] == "Esta mensagem foi excluída"


def test_direct_message_reaction_toggles_and_counts(tmp_path, monkeypatch):
    _prepare_database(tmp_path, monkeypatch)
    created_at = datetime.now(timezone.utc).isoformat()
    save_direct_message("dm-1", 1, 2, "React", created_at)

    active, counts = toggle_direct_reaction("dm-1", 1, "❤️", created_at)
    assert active is True
    assert counts == {"❤️": 1}

    active, counts = toggle_direct_reaction("dm-1", 1, "❤️", created_at)
    assert active is False
    assert counts == {}
