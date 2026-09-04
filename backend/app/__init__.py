"""Package-level compatibility hooks for the Pokinex moderation engine."""

import re
import sys
import time
from contextvars import ContextVar

from fastapi import WebSocket

from .auth import get_user_from_token
from .moderation_bot import ModerationBot, ModerationResult, moderation_bot
from .roles import get_user_role, is_owner
from .websocket.chat import manager
from .websocket.schemas import ChatMessageEvent


_LAUGHTER_RUN = re.compile(r"([kha])\1{8,}", re.IGNORECASE)
_current_message_id = ContextVar("pokinex_current_message_id", default=None)
_pending_cleanup_ids = ContextVar("pokinex_pending_cleanup_ids", default=None)
_original_moderate = ModerationBot.moderate


def _owner_aware_is_moderator(user) -> bool:
    return is_owner(user) or (
        str(user.get("role", "")).casefold() in {"moderator", "staff", "owner"}
        if user.get("role")
        else _configured_moderator(user)
    )


def _configured_moderator(user) -> bool:
    import os

    ids = {
        item.strip()
        for item in os.getenv("POKINEX_MODERATOR_IDS", "").split(",")
        if item.strip()
    }
    usernames = {
        item.strip().casefold()
        for item in os.getenv("POKINEX_MODERATOR_USERNAMES", "").split(",")
        if item.strip()
    }
    user_id = str(user.get("id", "")).strip()
    username = str(user.get("username", "")).strip().casefold()
    return (bool(user_id) and user_id in ids) or (
        bool(username) and username in usernames
    )


# main.py imports this symbol after the package initializer has executed.
_moderation_module = sys.modules["app.moderation_bot"]
_moderation_module.is_moderator = _owner_aware_is_moderator


def _moderate_with_pokinex_rules(self, message, user_id=None):
    safe_message = _LAUGHTER_RUN.sub(lambda match: match.group(1) * 4, message)
    current_message_id = _current_message_id.get()
    _pending_cleanup_ids.set([])

    history = getattr(self, "_duplicate_burst_history", None)
    if history is None:
        history = {}
        self._duplicate_burst_history = history

    key = str(user_id) if user_id is not None else None
    normalized = self.normalize_for_moderation(message).casefold()
    now = time.time()
    window = getattr(self, "DUPLICATE_WINDOW_SECONDS", 20.0)
    threshold = 5

    if key is not None and normalized:
        entries = history.setdefault(key, [])
        entries[:] = [
            entry for entry in entries
            if now - entry[0] <= window and entry[1] == normalized
        ]

        if entries:
            count = len(entries) + 1
            if count >= threshold:
                cleanup_ids = [
                    entry[2] for entry in entries[-4:] if entry[2]
                ]
                _pending_cleanup_ids.set(cleanup_ids)
                entries.clear()

                strike, escalation = self._register_violation(user_id)
                mute_minutes = escalation
                return ModerationResult(
                    False,
                    f"A mesma mensagem foi enviada 5 vezes seguidas. Uma ocorrência foi registrada (ocorrência {strike}).",
                    f"Ocorrência {strike} registrada por repetição excessiva. As 4 mensagens anteriores foram removidas e esta tentativa foi bloqueada.",
                    "duplicate_burst",
                    "duplicate_burst",
                    "medium",
                    mute_minutes,
                )

            internal_message = (
                f"{safe_message} [pokinex-duplicate-check-"
                f"{count}-{current_message_id or now}]"
            )
            result = _original_moderate(self, internal_message, user_id)
            if result.allowed:
                entries.append((now, normalized, current_message_id))
            return result

        result = _original_moderate(self, safe_message, user_id)
        if result.allowed:
            entries.append((now, normalized, current_message_id))
        return result

    return _original_moderate(self, safe_message, user_id)


ModerationBot.moderate = _moderate_with_pokinex_rules


# Moderation notices should read like system actions, not emoji-heavy chat replies.
_ROBOTIC_MODERATION_MESSAGES = {
    "length": "Mensagem bloqueada. O conteúdo excede o limite permitido.",
    "scam": "Mensagem bloqueada. Possível tentativa de golpe ou phishing detectada.",
    "suspicious_link": "Mensagem bloqueada. O link foi classificado como potencialmente suspeito.",
    "threat": "Mensagem bloqueada. O conteúdo foi identificado como ameaça.",
    "harassment": "Mensagem bloqueada. Conteúdo de assédio ou abuso não é permitido.",
    "link_spam": "Mensagem bloqueada. Excesso de links em uma única mensagem.",
    "mention_spam": "Mensagem bloqueada. Excesso de menções em uma única mensagem.",
    "caps": "Mensagem bloqueada. Evite escrever mensagens inteiras em caixa alta.",
    "repeated_chars": "Mensagem bloqueada. Repetição excessiva de caracteres não é permitida.",
    "duplicate": "Mensagem bloqueada. A mesma mensagem foi enviada repetidamente.",
    "flood": "Mensagem bloqueada. Você está enviando mensagens rápido demais.",
    "duplicate_burst": "Ocorrência registrada por repetição excessiva. As 4 mensagens anteriores foram removidas e esta tentativa foi bloqueada.",
}

_pokinex_moderate = ModerationBot.moderate


def _moderate_with_robotic_notices(self, message, user_id=None):
    result = _pokinex_moderate(self, message, user_id)
    if result.allowed or not result.category:
        return result

    bot_message = _ROBOTIC_MODERATION_MESSAGES.get(result.category, result.bot_message)
    if bot_message == result.bot_message:
        return result

    return ModerationResult(
        result.allowed,
        result.reason,
        bot_message,
        result.action,
        result.category,
        result.severity,
        result.mute_minutes,
    )


ModerationBot.moderate = _moderate_with_robotic_notices


def _remaining_mute_seconds(self, user_id) -> int:
    expires = self._muted_until.get(str(user_id))
    if expires is None:
        return 0
    remaining = max(0, int(expires - time.time() + 0.999))
    if remaining == 0:
        self._muted_until.pop(str(user_id), None)
    return remaining


ModerationBot.remaining_mute_seconds = _remaining_mute_seconds


async def _purge_repeated_messages(websocket: WebSocket, user, message_ids: list[str]):
    for message_id in message_ids:
        try:
            await manager.delete_message(user, message_id, websocket)
        except Exception:
            continue


_original_send_json = WebSocket.send_json


def _with_role(data):
    if not isinstance(data, dict):
        return data

    if data.get("type") == "users" and isinstance(data.get("users"), list):
        users = []
        for user in data["users"]:
            current = dict(user)
            if is_owner(current):
                current["role"] = "owner"
            elif current.get("role") not in {"bot", "moderator", "member"}:
                current["role"] = "moderator" if _configured_moderator(current) else "member"
            users.append(current)
        return {**data, "users": users}

    if data.get("type") in {"message", "message_edited"}:
        if is_owner({"id": data.get("userId"), "username": data.get("username", "")}):
            return {**data, "role": "owner"}
        if data.get("userId") != "moderation-bot" and not data.get("role"):
            return {**data, "role": "member"}

    if data.get("type") == "profile_updated" and isinstance(data.get("user"), dict):
        profile = dict(data["user"])
        profile["role"] = get_user_role(profile)
        return {**data, "user": profile}

    return data


async def _send_json_with_moderation_countdown(self, data, *args, **kwargs):
    data = _with_role(data)
    cleanup_ids = []
    if isinstance(data, dict) and data.get("type") == "moderation":
        action = data.get("action")

        if action == "duplicate_burst":
            cleanup_ids = list(_pending_cleanup_ids.get() or [])
            if cleanup_ids:
                data = {
                    **data,
                    "removeMessageIds": cleanup_ids,
                    "cleanupCount": len(cleanup_ids),
                }
            _pending_cleanup_ids.set([])

        if action in {"blocked", "duplicate", "flood", "muted", "duplicate_burst"}:
            token = self.cookies.get("session")
            current_user = get_user_from_token(token) if token else None
            if current_user:
                remaining = moderation_bot.remaining_mute_seconds(current_user["id"])
                if remaining > 0:
                    data = {**data, "muteRemainingSeconds": remaining}

    await _original_send_json(self, data, *args, **kwargs)

    if cleanup_ids:
        token = self.cookies.get("session")
        current_user = get_user_from_token(token) if token else None
        if current_user:
            await _purge_repeated_messages(self, current_user, cleanup_ids)


WebSocket.send_json = _send_json_with_moderation_countdown


_original_chat_event_validate = ChatMessageEvent.model_validate


@classmethod
def _chat_event_model_validate(cls, obj, *args, **kwargs):
    _current_message_id.set(
        obj.get("messageId") if isinstance(obj, dict) else None
    )
    return _original_chat_event_validate(obj, *args, **kwargs)


ChatMessageEvent.model_validate = _chat_event_model_validate
