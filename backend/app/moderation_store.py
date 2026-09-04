from app.database import get_connection, using_postgres


def _placeholders(size: int) -> str:
    return ",".join(["%s"] * size) if using_postgres() else ",".join(["?"] * size)


def _select_message_ids(where_sql: str = "", params=(), limit: int | None = None) -> list[str]:
    connection = get_connection()
    try:
        placeholder = "%s" if using_postgres() else "?"
        query = "SELECT message_id FROM messages"
        if where_sql:
            query += f" WHERE {where_sql}"
        query += " ORDER BY created_at DESC, message_id DESC"
        if limit is not None:
            query += f" LIMIT {placeholder}"
            params = (*params, limit)

        rows = connection.execute(query, params).fetchall()
        return [row["message_id"] for row in rows]
    finally:
        connection.close()


def delete_message_ids(message_ids: list[str]) -> list[str]:
    ids = [str(message_id).strip() for message_id in message_ids if str(message_id).strip()]
    if not ids:
        return []

    connection = get_connection()
    try:
        placeholders = _placeholders(len(ids))
        values = tuple(ids)
        connection.execute(
            f"DELETE FROM message_reactions WHERE message_id IN ({placeholders})",
            values,
        )
        cursor = connection.execute(
            f"DELETE FROM messages WHERE message_id IN ({placeholders})",
            values,
        )
        connection.commit()
        return ids if cursor.rowcount is None else ids[: cursor.rowcount]
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def clear_recent_messages(limit: int | None = None) -> list[str]:
    message_ids = _select_message_ids(limit=limit)
    return delete_message_ids(message_ids)


def clear_user_messages(user_id: int, limit: int | None = None) -> list[str]:
    placeholder = "%s" if using_postgres() else "?"
    message_ids = _select_message_ids(
        f"user_id = {placeholder}",
        (user_id,),
        limit=limit,
    )
    return delete_message_ids(message_ids)


def clear_all_messages() -> list[str]:
    return clear_recent_messages(limit=None)


def delete_single_message(message_id: str) -> bool:
    deleted = delete_message_ids([message_id])
    return bool(deleted)


def get_user_by_username(username: str):
    normalized = str(username or "").strip().casefold()
    if not normalized:
        return None

    connection = get_connection()
    try:
        placeholder = "%s" if using_postgres() else "?"
        row = connection.execute(
            f"SELECT id, username, display_name, avatar, status FROM users WHERE LOWER(username) = {placeholder} LIMIT 1",
            (normalized,),
        ).fetchone()
        if not row:
            return None
        return dict(row)
    finally:
        connection.close()
