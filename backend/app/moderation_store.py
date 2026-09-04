from app.database import get_connection, using_postgres


def clear_recent_messages(limit: int | None = None) -> list[str]:
    connection = get_connection()
    try:
        if using_postgres():
            id_rows = connection.execute(
                "SELECT message_id FROM messages ORDER BY created_at DESC, message_id DESC" + (" LIMIT %s" if limit else ""),
                (limit,) if limit else (),
            ).fetchall()
        else:
            id_rows = connection.execute(
                "SELECT message_id FROM messages ORDER BY created_at DESC, message_id DESC" + (" LIMIT ?" if limit else ""),
                (limit,) if limit else (),
            ).fetchall()

        message_ids = [row["message_id"] for row in id_rows]
        if not message_ids:
            return []

        placeholders = ",".join(["%s"] * len(message_ids)) if using_postgres() else ",".join(["?"] * len(message_ids))
        connection.execute(
            f"DELETE FROM message_reactions WHERE message_id IN ({placeholders})",
            tuple(message_ids),
        )
        connection.execute(
            f"DELETE FROM messages WHERE message_id IN ({placeholders})",
            tuple(message_ids),
        )
        connection.commit()
        return message_ids
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
