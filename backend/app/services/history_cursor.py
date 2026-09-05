"""Opaque, deterministic cursor encoding for message history pagination."""

import base64
import binascii
import json

_MAX_MESSAGE_ID_LENGTH = 128


def encode_cursor(created_at: str, message_id: str) -> str:
    payload = {
        "created_at": str(created_at),
        "message_id": str(message_id),
    }
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(cursor: str | None) -> tuple[str, str] | None:
    if not cursor:
        return None

    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.b64decode((cursor + padding).encode("ascii"), altchars=b"-_")
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, binascii.Error, json.JSONDecodeError):
        return None

    if not isinstance(payload, dict):
        return None

    created_at = payload.get("created_at")
    message_id = payload.get("message_id")
    if not isinstance(created_at, str) or not created_at.strip():
        return None
    if not isinstance(message_id, str) or not message_id.strip():
        return None
    if len(message_id) > _MAX_MESSAGE_ID_LENGTH:
        return None

    return created_at, message_id
