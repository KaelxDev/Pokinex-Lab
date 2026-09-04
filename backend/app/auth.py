from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets

from app.database import (
    _persistent_avatar_reference,
    get_connection,
    using_postgres,
)

SESSION_DAYS = 30
PASSWORD_ITERATIONS = 600_000


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _derive_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)


def hash_password(password: str) -> tuple[str, str]:
    salt = secrets.token_bytes(16)
    digest = _derive_password(password, salt)
    return digest.hex(), salt.hex()


def verify_password(password: str, password_hash: str, password_salt: str) -> bool:
    try:
        expected = bytes.fromhex(password_hash)
        salt = bytes.fromhex(password_salt)
    except ValueError:
        return False
    return hmac.compare_digest(_derive_password(password, salt), expected)


def validate_credentials(username: str, password: str) -> tuple[str | None, str | None]:
    username = username.strip()
    if len(username) < 3 or len(username) > 20:
        return None, "Username deve ter entre 3 e 20 caracteres."
    if not all(char.isalnum() or char in "_-" for char in username):
        return None, "Username deve usar apenas letras, números, _ ou -."
    if len(password) < 8 or len(password) > 128:
        return None, "Senha deve ter entre 8 e 128 caracteres."
    return username, None


def validate_username(username: str) -> tuple[str | None, str | None]:
    username = username.strip()
    if len(username) < 3 or len(username) > 20:
        return None, "Username deve ter entre 3 e 20 caracteres."
    if not all(char.isalnum() or char in "_-" for char in username):
        return None, "Username deve usar apenas letras, números, _ ou -."
    return username, None


def create_user(username: str, password: str) -> dict:
    username, error = validate_credentials(username, password)
    if error:
        raise ValueError(error)

    password_hash, password_salt = hash_password(password)
    created_at = now_utc().isoformat()
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
        return get_user_by_id(user_id, connection=connection)
    except Exception as exc:
        connection.rollback()
        if using_postgres():
            import psycopg
            if isinstance(exc, psycopg.errors.UniqueViolation):
                raise ValueError("Username já está em uso.") from exc
        else:
            import sqlite3
            if isinstance(exc, sqlite3.IntegrityError):
                raise ValueError("Username já está em uso.") from exc
        raise
    finally:
        connection.close()


def get_user_by_id(user_id: int, connection=None) -> dict | None:
    owns_connection = connection is None
    connection = connection or get_connection()
    try:
        query = """
            SELECT id, username, display_name, avatar, status
            FROM users
            WHERE id = %s
        """ if using_postgres() else """
            SELECT id, username, display_name, avatar, status
            FROM users
            WHERE id = ?
        """
        user = connection.execute(query, (user_id,)).fetchone()
        if not user:
            return None
        return {
            "id": user["id"],
            "username": user["username"],
            "displayName": user["display_name"],
            "avatar": _persistent_avatar_reference(
                connection,
                user["id"],
                user["avatar"],
            ),
            "status": user["status"],
        }
    finally:
        if owns_connection:
            connection.close()


def authenticate(username: str, password: str) -> dict | None:
    connection = get_connection()
    try:
        query = """
            SELECT id, username, password_hash, password_salt, display_name, avatar, status
            FROM users
            WHERE LOWER(username) = LOWER(%s)
        """ if using_postgres() else """
            SELECT id, username, password_hash, password_salt, display_name, avatar, status
            FROM users
            WHERE username = ? COLLATE NOCASE
        """
        user = connection.execute(query, (username.strip(),)).fetchone()
        if not user or not verify_password(
            password,
            user["password_hash"],
            user["password_salt"],
        ):
            return None

        return {
            "id": user["id"],
            "username": user["username"],
            "displayName": user["display_name"],
            "avatar": _persistent_avatar_reference(
                connection,
                user["id"],
                user["avatar"],
            ),
            "status": user["status"],
        }
    finally:
        connection.close()


def create_session(user_id: int) -> str:
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    created_at = now_utc()
    expires_at = created_at + timedelta(days=SESSION_DAYS)
    connection = get_connection()
    try:
        query = """
            INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
            VALUES (%s, %s, %s, %s)
        """ if using_postgres() else """
            INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
            VALUES (?, ?, ?, ?)
        """
        connection.execute(
            query,
            (token_hash, user_id, expires_at.isoformat(), created_at.isoformat()),
        )
        connection.commit()
    finally:
        connection.close()
    return raw_token


def get_user_from_token(token: str | None) -> dict | None:
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    connection = get_connection()
    try:
        query = """
            SELECT u.id, u.username, u.display_name, u.avatar, u.status, s.expires_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = %s
        """ if using_postgres() else """
            SELECT u.id, u.username, u.display_name, u.avatar, u.status, s.expires_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
        """
        row = connection.execute(query, (token_hash,)).fetchone()
        if not row:
            return None
        try:
            expires_at = datetime.fromisoformat(row["expires_at"])
        except (ValueError, TypeError):
            return None
        if expires_at <= now_utc():
            delete_query = (
                "DELETE FROM sessions WHERE token_hash = %s"
                if using_postgres()
                else "DELETE FROM sessions WHERE token_hash = ?"
            )
            connection.execute(delete_query, (token_hash,))
            connection.commit()
            return None
        return {
            "id": row["id"],
            "username": row["username"],
            "displayName": row["display_name"],
            "avatar": _persistent_avatar_reference(
                connection,
                row["id"],
                row["avatar"],
            ),
            "status": row["status"],
        }
    finally:
        connection.close()


def delete_session(token: str | None) -> None:
    if not token:
        return
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    connection = get_connection()
    try:
        query = (
            "DELETE FROM sessions WHERE token_hash = %s"
            if using_postgres()
            else "DELETE FROM sessions WHERE token_hash = ?"
        )
        connection.execute(query, (token_hash,))
        connection.commit()
    finally:
        connection.close()


def update_profile(
    user_id: int,
    username: str,
    display_name: str,
    avatar: str,
    status: str,
) -> dict | None:
    username, error = validate_username(username)
    if error:
        raise ValueError(error)
    display_name = display_name.strip()[:30]
    status = status.strip()[:60]
    avatar = avatar.strip()
    if not display_name:
        return None

    connection = get_connection()
    try:
        query = """
            UPDATE users
            SET username = %s, display_name = %s, avatar = %s, status = %s
            WHERE id = %s
        """ if using_postgres() else """
            UPDATE users
            SET username = ?, display_name = ?, avatar = ?, status = ?
            WHERE id = ?
        """
        connection.execute(query, (username, display_name, avatar, status, user_id))
        connection.commit()
        return get_user_by_id(user_id, connection=connection)
    except Exception as exc:
        connection.rollback()
        if using_postgres():
            import psycopg
            if isinstance(exc, psycopg.errors.UniqueViolation):
                raise ValueError("Username já está em uso.") from exc
        else:
            import sqlite3
            if isinstance(exc, sqlite3.IntegrityError):
                raise ValueError("Username já está em uso.") from exc
        raise
    finally:
        connection.close()
