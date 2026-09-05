"""Public user identity payloads shared by realtime services."""

from app.roles import get_user_role


def public_user_payload(user, *, online: bool | None = None) -> dict:
    payload = {
        "id": user["id"],
        "username": user["username"],
        "displayName": user["displayName"],
        "avatar": user["avatar"],
        "status": user["status"],
        "role": user.get("role") or get_user_role(user),
    }
    if online is not None:
        payload["online"] = online
    return payload
