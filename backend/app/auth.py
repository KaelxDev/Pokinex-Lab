from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets

from app.repositories.session_repository import (
    create_session as persist_session,
    delete_session as remove_session,
    get_session_user_row,
)
from app.repositories.user_repository import (
    UserAlreadyExistsError,
    create_user_record,
    get_user_credentials_by_username,
    get_user_profile_by_id,
    persistent_avatar_reference,
    update_user_record,
)
from app.roles import get_user_role

SESSION_DAYS = 30
PASSWORD_ITERATIONS = 600_000


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _derive_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )


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


def _with_role(user: dict | None) -> dict | None:
    if user is None:
        return None
    user = dict(user)
    user["role"] = get_user_role(user)
    return user


def create_user(username: str, password: str) -> dict:
    username, error = validate_credentials(username, password)
    if error:
        raise ValueError(error)

    password_hash, password_salt = hash_password(password)
    created_at = now_utc().isoformat()
    try:
        user_id = create_user_record(
            username,
            password_hash,
            password_salt,
            created_at,
        )
    except UserAlreadyExistsError as exc:
        raise ValueError(str(exc)) from exc

    return get_user_by_id(user_id)


def get_user_by_id(user_id: int, connection=None) -> dict | None:
    # `connection` remains accepted for backwards compatibility. New repository
    # operations own their connections so callers cannot accidentally leak one.
    return _with_role(get_user_profile_by_id(user_id))


def authenticate(username: str, password: str) -> dict | None:
    user = get_user_credentials_by_username(username.strip())
    if not user or not verify_password(
        password,
        user["password_hash"],
        user["password_salt"],
    ):
        return None

    return get_user_by_id(user["id"])


def create_session(user_id: int) -> str:
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    created_at = now_utc()
    expires_at = created_at + timedelta(days=SESSION_DAYS)

    persist_session(
        user_id,
        token_hash,
        expires_at.isoformat(),
        created_at.isoformat(),
    )
    return raw_token


def get_user_from_token(token: str | None) -> dict | None:
    if not token:
        return None

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = get_session_user_row(token_hash)
    if not row:
        return None

    try:
        expires_at = datetime.fromisoformat(row["expires_at"])
    except (ValueError, TypeError):
        return None

    if expires_at <= now_utc():
        remove_session(token_hash)
        return None

    return get_user_by_id(row["id"])


def delete_session(token: str | None) -> None:
    if not token:
        return
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    remove_session(token_hash)


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

    try:
        updated = update_user_record(
            user_id,
            username,
            display_name,
            avatar,
            status,
        )
    except UserAlreadyExistsError as exc:
        raise ValueError(str(exc)) from exc

    return _with_role(updated)


# Kept as a compatibility export for older modules that used this helper
# directly from auth.py.
__all__ = [
    "SESSION_DAYS",
    "PASSWORD_ITERATIONS",
    "now_utc",
    "hash_password",
    "verify_password",
    "validate_credentials",
    "validate_username",
    "create_user",
    "get_user_by_id",
    "authenticate",
    "create_session",
    "get_user_from_token",
    "delete_session",
    "update_profile",
    "persistent_avatar_reference",
]
