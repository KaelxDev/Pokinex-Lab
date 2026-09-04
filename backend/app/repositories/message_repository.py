"""Persistence operations for public chat messages and reactions."""

from app.infrastructure.database import get_connection, postgres_or_sqlite, using_postgres


def _persistent_avatar_reference(connection, user_id, fallback=""):
    query = postgres_or_sqlite(
        "SELECT updated_at FROM user_avatars WHERE user_id = %s",
        "SELECT updated_at FROM user_avatars WHERE user_id = ?",
    )
    row = connection.execute(query, (user_id,)).fetchone()
    if row:
        version = str(row["updated_at"] or "")
        return (
            f"/api/auth/avatar/{user_id}?v={version}"
            if version
            else f"/api/auth/avatar/{user_id}"
        )

    fallback_value = str(fallback or "").strip()
    if fallback_value.startswith("/api/auth/avatar/") or fallback_value.startswith("/media/"):
        return ""
    return fallback_value


def _profile_from_row(connection, row):
    if not row:
        return None
    user = {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "avatar": row["avatar"] or "",
        "status": row["status"],
    }
    user["avatar"] = _persistent_avatar_reference(connection, user["id"], user["avatar"])
    return user


def save_message(message_id, user_id, message, created_at, reply_to_message_id=None):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            INSERT INTO messages
                (message_id, user_id, message, created_at, reply_to_message_id)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (message_id) DO NOTHING
            """,
            """
            INSERT OR IGNORE INTO messages
                (message_id, user_id, message, created_at, reply_to_message_id)
            VALUES (?, ?, ?, ?, ?)
            """,
        )
        connection.execute(query, (message_id, user_id, message, created_at, reply_to_message_id))
        connection.commit()
    finally:
        connection.close()


def get_message_owner(message_id):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            "SELECT user_id FROM messages WHERE message_id = %s",
            "SELECT user_id FROM messages WHERE message_id = ?",
        )
        row = connection.execute(query, (message_id,)).fetchone()
        return int(row["user_id"]) if row else None
    finally:
        connection.close()


def get_message(message_id):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            SELECT m.message_id, m.user_id, m.message, m.created_at,
                   m.edited_at, m.deleted_at, m.reply_to_message_id,
                   u.username, u.display_name, u.avatar
            FROM messages m
            JOIN users u ON u.id = m.user_id
            WHERE m.message_id = %s
            """,
            """
            SELECT m.message_id, m.user_id, m.message, m.created_at,
                   m.edited_at, m.deleted_at, m.reply_to_message_id,
                   u.username, u.display_name, u.avatar
            FROM messages m
            JOIN users u ON u.id = m.user_id
            WHERE m.message_id = ?
            """,
        )
        row = connection.execute(query, (message_id,)).fetchone()
        if not row:
            return None
        result = dict(row)
        result["avatar"] = _persistent_avatar_reference(connection, result["user_id"], result["avatar"])
        return result
    finally:
        connection.close()


def update_message(message_id, user_id, message, edited_at):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            UPDATE messages
            SET message = %s, edited_at = %s, deleted_at = NULL
            WHERE message_id = %s AND user_id = %s
            """,
            """
            UPDATE messages
            SET message = ?, edited_at = ?, deleted_at = NULL
            WHERE message_id = ? AND user_id = ?
            """,
        )
        cursor = connection.execute(query, (message, edited_at, message_id, user_id))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def delete_message(message_id, user_id, deleted_at):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            UPDATE messages
            SET deleted_at = %s
            WHERE message_id = %s AND user_id = %s
            """,
            """
            UPDATE messages
            SET deleted_at = ?
            WHERE message_id = ? AND user_id = ?
            """,
        )
        cursor = connection.execute(query, (deleted_at, message_id, user_id))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def toggle_reaction(message_id, user_id, reaction, created_at):
    connection = get_connection()

    try:
        if not using_postgres():
            connection.execute("BEGIN IMMEDIATE")

        if using_postgres():
            toggle_query = """
                WITH deleted AS (
                    DELETE FROM message_reactions
                    WHERE message_id = %s AND user_id = %s AND reaction = %s
                    RETURNING 1
                ),
                inserted AS (
                    INSERT INTO message_reactions
                        (message_id, user_id, reaction, created_at)
                    SELECT %s, %s, %s, %s
                    WHERE NOT EXISTS (SELECT 1 FROM deleted)
                    ON CONFLICT DO NOTHING
                    RETURNING 1
                )
                SELECT EXISTS (SELECT 1 FROM inserted) AS active
            """
            row = connection.execute(
                toggle_query,
                (
                    message_id,
                    user_id,
                    reaction,
                    message_id,
                    user_id,
                    reaction,
                    created_at,
                ),
            ).fetchone()
            active = bool(row["active"])
        else:
            select_query = """
                SELECT 1 FROM message_reactions
                WHERE message_id = ? AND user_id = ? AND reaction = ?
            """
            existing = connection.execute(
                select_query,
                (message_id, user_id, reaction),
            ).fetchone()

            if existing:
                connection.execute(
                    """
                    DELETE FROM message_reactions
                    WHERE message_id = ? AND user_id = ? AND reaction = ?
                    """,
                    (message_id, user_id, reaction),
                )
                active = False
            else:
                connection.execute(
                    """
                    INSERT INTO message_reactions
                        (message_id, user_id, reaction, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (message_id, user_id, reaction, created_at),
                )
                active = True

        count_query = postgres_or_sqlite(
            """
            SELECT reaction, COUNT(*) AS count
            FROM message_reactions
            WHERE message_id = %s
            GROUP BY reaction
            """,
            """
            SELECT reaction, COUNT(*) AS count
            FROM message_reactions
            WHERE message_id = ?
            GROUP BY reaction
            """,
        )
        rows = connection.execute(count_query, (message_id,)).fetchall()
        connection.commit()
        return active, {row["reaction"]: row["count"] for row in rows}
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_reactions(message_id):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            SELECT reaction, COUNT(*) AS count
            FROM message_reactions
            WHERE message_id = %s
            GROUP BY reaction
            """,
            """
            SELECT reaction, COUNT(*) AS count
            FROM message_reactions
            WHERE message_id = ?
            GROUP BY reaction
            """,
        )
        rows = connection.execute(query, (message_id,)).fetchall()
        return {row["reaction"]: row["count"] for row in rows}
    finally:
        connection.close()
