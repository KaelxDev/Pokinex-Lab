from datetime import datetime, timezone

from app.database import get_connection, using_postgres


def store_avatar(user_id: int, content: bytes, content_type: str) -> str:
    """Persist an avatar in the database and return its stable API path."""
    updated_at = datetime.now(timezone.utc).isoformat()
    connection = get_connection()
    try:
        query = (
            """
            INSERT INTO user_avatars (user_id, content, content_type, updated_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE SET
                content = EXCLUDED.content,
                content_type = EXCLUDED.content_type,
                updated_at = EXCLUDED.updated_at
            """
            if using_postgres()
            else
            """
            INSERT INTO user_avatars (user_id, content, content_type, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                content = excluded.content,
                content_type = excluded.content_type,
                updated_at = excluded.updated_at
            """
        )
        connection.execute(query, (user_id, content, content_type, updated_at))
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    return f"/api/auth/avatar/{user_id}"


def get_avatar(user_id: int) -> tuple[bytes, str] | None:
    connection = get_connection()
    try:
        query = (
            "SELECT content, content_type FROM user_avatars WHERE user_id = %s"
            if using_postgres()
            else "SELECT content, content_type FROM user_avatars WHERE user_id = ?"
        )
        row = connection.execute(query, (user_id,)).fetchone()
        if not row:
            return None
        return bytes(row["content"]), row["content_type"]
    finally:
        connection.close()
