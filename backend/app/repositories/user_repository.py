"""Persistence operations for users and public profile data."""

from app.infrastructure.database import get_connection, postgres_or_sqlite, using_postgres


class UserAlreadyExistsError(ValueError):
    """Raised when a username violates the users table uniqueness rule."""


def persistent_avatar_reference(connection, user_id, fallback=""):
    """Return the canonical API reference for a persisted user avatar."""
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


def profile_from_row(connection, row):
    """Build a public profile payload from a users table row."""
    if not row:
        return None
    user = {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "avatar": row["avatar"] or "",
        "status": row["status"],
    }
    user["avatar"] = persistent_avatar_reference(connection, user["id"], user["avatar"])
    return user


def create_user_record(username, password_hash, password_salt, created_at):
    """Insert a user and return its generated id."""
    connection = get_connection()
    try:
        if using_postgres():
            cursor = connection.execute(
                """
                INSERT INTO users (username, password_hash, password_salt, display_name, created_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (username, password_hash, password_salt, username, created_at),
            )
            user_id = cursor.fetchone()["id"]
        else:
            cursor = connection.execute(
                """
                INSERT INTO users (username, password_hash, password_salt, display_name, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (username, password_hash, password_salt, username, created_at),
            )
            user_id = cursor.lastrowid

        connection.commit()
        return user_id
    except Exception as exc:
        connection.rollback()
        if _is_integrity_error(exc):
            raise UserAlreadyExistsError("Username já está em uso.") from exc
        raise
    finally:
        connection.close()


def get_user_profile_by_id(user_id):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            SELECT id, username, display_name, avatar, status
            FROM users
            WHERE id = %s
            """,
            """
            SELECT id, username, display_name, avatar, status
            FROM users
            WHERE id = ?
            """,
        )
        row = connection.execute(query, (user_id,)).fetchone()
        return profile_from_row(connection, row)
    finally:
        connection.close()


def get_user_credentials_by_username(username):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            SELECT id, username, password_hash, password_salt, display_name, avatar, status
            FROM users
            WHERE LOWER(username) = LOWER(%s)
            """,
            """
            SELECT id, username, password_hash, password_salt, display_name, avatar, status
            FROM users
            WHERE username = ? COLLATE NOCASE
            """,
        )
        return connection.execute(query, (username,)).fetchone()
    finally:
        connection.close()


def update_user_record(user_id, username, display_name, avatar, status):
    connection = get_connection()
    try:
        query = postgres_or_sqlite(
            """
            UPDATE users
            SET username = %s, display_name = %s, avatar = %s, status = %s
            WHERE id = %s
            """,
            """
            UPDATE users
            SET username = ?, display_name = ?, avatar = ?, status = ?
            WHERE id = ?
            """,
        )
        connection.execute(query, (username, display_name, avatar, status, user_id))
        connection.commit()
    except Exception as exc:
        connection.rollback()
        if _is_integrity_error(exc):
            raise UserAlreadyExistsError("Username já está em uso.") from exc
        raise
    finally:
        connection.close()

    return get_user_profile_by_id(user_id)


def _is_integrity_error(exc):
    try:
        import psycopg
        if isinstance(exc, psycopg.errors.UniqueViolation):
            return True
    except ImportError:
        pass

    try:
        import sqlite3
        if isinstance(exc, sqlite3.IntegrityError):
            return True
    except ImportError:
        pass

    return False
