"""Persistence operations for direct messages and reactions."""

from app.infrastructure.database import get_connection, postgres_or_sqlite, using_postgres
from app.repositories.user_repository import persistent_avatar_reference

MAX_HISTORY_LIMIT = 100


def _reaction_map(connection, message_ids):
    if not message_ids:
        return {}

    placeholders = ", ".join(["%s"] * len(message_ids)) if using_postgres() else ", ".join(["?"] * len(message_ids))
    rows = connection.execute(
        f"""
        SELECT message_id, reaction, COUNT(*) AS count
        FROM direct_message_reactions
        WHERE message_id IN ({placeholders})
        GROUP BY message_id, reaction
        """,
        tuple(message_ids),
    ).fetchall()

    result = {}
    for row in rows:
        result.setdefault(row["message_id"], {})[row["reaction"]] = int(row["count"])
    return result


def get_direct_message_history(user_id, other_user_id, limit=50, before=None):
    limit = max(1, min(int(limit), MAX_HISTORY_LIMIT))
    connection = get_connection()
    try:
        placeholder = "%s" if using_postgres() else "?"
        before_clause = f" AND dm.created_at < {placeholder}" if before else ""
        query = f"""
            SELECT dm.message_id, dm.sender_id, dm.recipient_id, dm.message,
                   dm.created_at, dm.edited_at, dm.deleted_at, dm.reply_to_message_id,
                   su.username AS sender_username, su.display_name AS sender_display_name, su.avatar AS sender_avatar,
                   ru.username AS recipient_username, ru.display_name AS recipient_display_name, ru.avatar AS recipient_avatar,
                   rm.message AS reply_message, rm.deleted_at AS reply_deleted_at,
                   rsu.id AS reply_user_id, rsu.username AS reply_username, rsu.display_name AS reply_display_name, rsu.avatar AS reply_avatar
            FROM direct_messages dm
            JOIN users su ON su.id = dm.sender_id
            JOIN users ru ON ru.id = dm.recipient_id
            LEFT JOIN direct_messages rm ON rm.message_id = dm.reply_to_message_id
            LEFT JOIN users rsu ON rsu.id = rm.sender_id
            WHERE ((dm.sender_id = {placeholder} AND dm.recipient_id = {placeholder})
                OR (dm.sender_id = {placeholder} AND dm.recipient_id = {placeholder}))
            {before_clause}
            ORDER BY dm.created_at DESC, dm.message_id DESC
            LIMIT {placeholder}
        """

        params = [user_id, other_user_id, other_user_id, user_id]
        if before:
            params.append(before)
        params.append(limit + 1)

        rows = connection.execute(query, tuple(params)).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        reactions = _reaction_map(connection, [row["message_id"] for row in rows])

        messages = []
        for row in reversed(rows):
            sender_avatar = persistent_avatar_reference(
                connection,
                row["sender_id"],
                row["sender_avatar"],
            )
            recipient_avatar = persistent_avatar_reference(
                connection,
                row["recipient_id"],
                row["recipient_avatar"],
            )

            item = {
                "type": "direct_message",
                "messageId": row["message_id"],
                "senderId": row["sender_id"],
                "recipientId": row["recipient_id"],
                "userId": row["sender_id"],
                "username": row["sender_username"],
                "displayName": row["sender_display_name"],
                "avatar": sender_avatar,
                "recipientUsername": row["recipient_username"],
                "recipientDisplayName": row["recipient_display_name"],
                "recipientAvatar": recipient_avatar,
                "message": "Esta mensagem foi excluída" if row["deleted_at"] else row["message"],
                "timestamp": row["created_at"],
                "edited": bool(row["edited_at"]),
                "editedAt": row["edited_at"],
                "deleted": bool(row["deleted_at"]),
                "deletedAt": row["deleted_at"],
                "reactions": reactions.get(row["message_id"], {}),
                "deliveryStatus": "sent",
                "offline": False,
            }

            if row["reply_to_message_id"] and row["reply_username"]:
                item["replyTo"] = {
                    "messageId": row["reply_to_message_id"],
                    "userId": row["reply_user_id"],
                    "username": row["reply_username"],
                    "displayName": row["reply_display_name"],
                    "avatar": persistent_avatar_reference(
                        connection,
                        row["reply_user_id"],
                        row["reply_avatar"],
                    ),
                    "message": "Esta mensagem foi excluída" if row["reply_deleted_at"] else row["reply_message"],
                    "deleted": bool(row["reply_deleted_at"]),
                }

            messages.append(item)

        return {
            "messages": messages,
            "hasMore": has_more,
            "nextBefore": messages[0]["timestamp"] if has_more and messages else None,
        }
    finally:
        connection.close()


def save_direct_message(
    message_id,
    sender_id,
    recipient_id,
    message,
    created_at,
    reply_to_message_id=None,
):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            INSERT INTO direct_messages
                (message_id, sender_id, recipient_id, message, created_at, reply_to_message_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (message_id) DO NOTHING
            """,
            """
            INSERT OR IGNORE INTO direct_messages
                (message_id, sender_id, recipient_id, message, created_at, reply_to_message_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
        )
        cursor = connection.execute(
            query,
            (
                message_id,
                sender_id,
                recipient_id,
                message,
                created_at,
                reply_to_message_id,
            ),
        )
        connection.commit()
        return cursor.rowcount > 0
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_direct_message(message_id):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            SELECT dm.message_id, dm.sender_id, dm.recipient_id, dm.message,
                   dm.created_at, dm.edited_at, dm.deleted_at,
                   su.username AS sender_username, su.display_name AS sender_display_name, su.avatar AS sender_avatar,
                   ru.username AS recipient_username, ru.display_name AS recipient_display_name, ru.avatar AS recipient_avatar
            FROM direct_messages dm
            JOIN users su ON su.id = dm.sender_id
            JOIN users ru ON ru.id = dm.recipient_id
            WHERE dm.message_id = %s
            """,
            """
            SELECT dm.message_id, dm.sender_id, dm.recipient_id, dm.message,
                   dm.created_at, dm.edited_at, dm.deleted_at,
                   su.username AS sender_username, su.display_name AS sender_display_name, su.avatar AS sender_avatar,
                   ru.username AS recipient_username, ru.display_name AS recipient_display_name, ru.avatar AS recipient_avatar
            FROM direct_messages dm
            JOIN users su ON su.id = dm.sender_id
            JOIN users ru ON ru.id = dm.recipient_id
            WHERE dm.message_id = ?
            """,
        )
        row = connection.execute(query, (message_id,)).fetchone()
        if not row:
            return None

        return {
            "messageId": row["message_id"],
            "senderId": row["sender_id"],
            "recipientId": row["recipient_id"],
            "userId": row["sender_id"],
            "username": row["sender_username"],
            "displayName": row["sender_display_name"],
            "avatar": persistent_avatar_reference(
                connection,
                row["sender_id"],
                row["sender_avatar"],
            ),
            "recipientUsername": row["recipient_username"],
            "recipientDisplayName": row["recipient_display_name"],
            "recipientAvatar": persistent_avatar_reference(
                connection,
                row["recipient_id"],
                row["recipient_avatar"],
            ),
            "message": "Esta mensagem foi excluída" if row["deleted_at"] else row["message"],
            "timestamp": row["created_at"],
            "edited": bool(row["edited_at"]),
            "editedAt": row["edited_at"],
            "deleted": bool(row["deleted_at"]),
            "deletedAt": row["deleted_at"],
            "reactions": _reaction_map(connection, [row["message_id"]]).get(row["message_id"], {}),
            "deliveryStatus": "sent",
            "offline": False,
        }
    finally:
        connection.close()


def update_direct_message(message_id, user_id, message, edited_at):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            UPDATE direct_messages
            SET message = %s, edited_at = %s, deleted_at = NULL
            WHERE message_id = %s AND sender_id = %s
            """,
            """
            UPDATE direct_messages
            SET message = ?, edited_at = ?, deleted_at = NULL
            WHERE message_id = ? AND sender_id = ?
            """,
        )
        cursor = connection.execute(query, (message, edited_at, message_id, user_id))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def delete_direct_message(message_id, user_id, deleted_at):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            UPDATE direct_messages
            SET deleted_at = %s
            WHERE message_id = %s AND sender_id = %s
            """,
            """
            UPDATE direct_messages
            SET deleted_at = ?
            WHERE message_id = ? AND sender_id = ?
            """,
        )
        cursor = connection.execute(query, (deleted_at, message_id, user_id))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()


def toggle_direct_reaction(message_id, user_id, reaction, created_at):
    connection = get_connection()
    try:
        placeholder = "%s" if using_postgres() else "?"
        existing = connection.execute(
            f"""
            SELECT 1
            FROM direct_message_reactions
            WHERE message_id = {placeholder} AND user_id = {placeholder} AND reaction = {placeholder}
            """,
            (message_id, user_id, reaction),
        ).fetchone()

        if existing:
            connection.execute(
                f"""
                DELETE FROM direct_message_reactions
                WHERE message_id = {placeholder} AND user_id = {placeholder} AND reaction = {placeholder}
                """,
                (message_id, user_id, reaction),
            )
            active = False
        else:
            query = postgres_or_sqlite(
                """
                INSERT INTO direct_message_reactions
                    (message_id, user_id, reaction, created_at)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (message_id, user_id, reaction) DO NOTHING
                """,
                """
                INSERT OR IGNORE INTO direct_message_reactions
                    (message_id, user_id, reaction, created_at)
                VALUES (?, ?, ?, ?)
                """,
            )
            connection.execute(query, (message_id, user_id, reaction, created_at))
            active = True

        reactions = _reaction_map(connection, [message_id]).get(message_id, {})
        connection.commit()
        return active, reactions
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
