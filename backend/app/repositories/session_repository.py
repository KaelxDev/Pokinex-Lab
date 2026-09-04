"""Persistence operations for authenticated sessions."""

from app.infrastructure.database import get_connection, postgres_or_sqlite


def create_session(user_id, token_hash, expires_at, created_at):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
            VALUES (%s, %s, %s, %s)
            """,
            """
            INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            """,
        )
        connection.execute(query, (token_hash, user_id, expires_at, created_at))
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_session_user_row(token_hash):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            SELECT u.id, u.username, u.display_name, u.avatar, u.status, s.expires_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = %s
            """,
            """
            SELECT u.id, u.username, u.display_name, u.avatar, u.status, s.expires_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
            """,
        )
        return connection.execute(query, (token_hash,)).fetchone()
    finally:
        connection.close()


def delete_session(token_hash):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            "DELETE FROM sessions WHERE token_hash = %s",
            "DELETE FROM sessions WHERE token_hash = ?",
        )
        connection.execute(query, (token_hash,))
        connection.commit()
    finally:
        connection.close()
