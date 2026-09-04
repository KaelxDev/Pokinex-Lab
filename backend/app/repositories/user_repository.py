"""Persistence helpers for user-facing profile data."""

from app.infrastructure.database import get_connection, postgres_or_sqlite


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
    user["avatar"] = persistent_avatar_reference(
        connection,
        user["id"],
        user["avatar"],
    )
    return user
