from app.database import _persistent_avatar_reference, get_connection, using_postgres

MAX_HISTORY_LIMIT = 100


def save_direct_message(
    message_id: str,
    sender_id: int,
    recipient_id: int,
    message: str,
    created_at: str,
) -> None:
    connection = get_connection()
    try:
        query = (
            """
            INSERT INTO direct_messages
                (message_id, sender_id, recipient_id, message, created_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (message_id) DO NOTHING
            """
            if using_postgres()
            else
            """
            INSERT OR IGNORE INTO direct_messages
                (message_id, sender_id, recipient_id, message, created_at)
            VALUES (?, ?, ?, ?, ?)
            """
        )
        connection.execute(
            query,
            (message_id, sender_id, recipient_id, message, created_at),
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_direct_message_history(
    user_id: int,
    other_user_id: int,
    limit: int = 50,
    before: str | None = None,
) -> dict:
    limit = max(1, min(int(limit), MAX_HISTORY_LIMIT))
    connection = get_connection()

    try:
        placeholder = "%s" if using_postgres() else "?"
        before_clause = f" AND dm.created_at < {placeholder}" if before else ""

        query = f"""
            SELECT
                dm.message_id,
                dm.sender_id,
                dm.recipient_id,
                dm.message,
                dm.created_at,
                dm.edited_at,
                dm.deleted_at,
                su.username AS sender_username,
                su.display_name AS sender_display_name,
                su.avatar AS sender_avatar,
                ru.username AS recipient_username,
                ru.display_name AS recipient_display_name,
                ru.avatar AS recipient_avatar
            FROM direct_messages dm
            JOIN users su ON su.id = dm.sender_id
            JOIN users ru ON ru.id = dm.recipient_id
            WHERE (
                (dm.sender_id = {placeholder} AND dm.recipient_id = {placeholder})
                OR
                (dm.sender_id = {placeholder} AND dm.recipient_id = {placeholder})
            )
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

        if not rows:
            return {"messages": [], "hasMore": False, "nextBefore": None}

        messages = []
        for row in reversed(rows):
            sender_avatar = _persistent_avatar_reference(
                connection,
                row["sender_id"],
                row["sender_avatar"],
            )
            recipient_avatar = _persistent_avatar_reference(
                connection,
                row["recipient_id"],
                row["recipient_avatar"],
            )
            is_deleted = bool(row["deleted_at"])
            messages.append(
                {
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
                    "message": "Esta mensagem foi excluída" if is_deleted else row["message"],
                    "timestamp": row["created_at"],
                    "edited": bool(row["edited_at"]),
                    "editedAt": row["edited_at"],
                    "deleted": is_deleted,
                    "deletedAt": row["deleted_at"],
                    "deliveryStatus": "sent",
                    "offline": False,
                }
            )

        return {
            "messages": messages,
            "hasMore": has_more,
            "nextBefore": messages[0]["timestamp"] if has_more else None,
        }
    finally:
        connection.close()
