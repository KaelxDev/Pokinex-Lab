"""Explicit compatibility runtime for the existing PokiBot moderation behavior.

This module intentionally contains legacy compatibility shims while the moderation
engine is being migrated to explicit services. It is installed from the application
composition root instead of executing as a package import side effect.
"""

import re
import sys
import time
from contextvars import ContextVar

from fastapi import WebSocket

from app.auth import get_user_from_token
from app.moderation_bot import ModerationBot, ModerationResult
from app.roles import get_user_role, is_owner
from app.websocket.chat import manager
from app.websocket.schemas import ChatMessageEvent


_LAUGHTER_RUN = re.compile(r"([kha])\1{8,}", re.IGNORECASE)
_ZERO_WIDTH = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060\ufeff]")
_current_message_id = ContextVar("pokinex_current_message_id", default=None)
_pending_cleanup_ids = ContextVar("pokinex_pending_cleanup_ids", default=None)
_INSTALLED = False


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


def _owner_aware_is_moderator(user) -> bool:
    return is_owner(user) or (
        str(user.get("role", "")).casefold() in {"moderator", "staff", "owner"}
        if user.get("role")
        else _configured_moderator(user)
    )


def install_moderation_compat() -> None:
    """Install legacy moderation compatibility hooks exactly once."""
    global _INSTALLED
    if _INSTALLED:
        return

    moderation_module = sys.modules["app.moderation_bot"]
    original_moderate = ModerationBot.moderate

    def _raw_mention_spam_result(self, message, user_id=None):
        mention_source = _ZERO_WIDTH.sub("", message)
        mention_count = self._mention_count(mention_source)
        if mention_count <= self.MAX_MENTIONS_PER_MESSAGE:
            return None

        self._total_blocked += 1
        self._categories["mention_spam"] += 1
        strike, escalation = self._register_violation(user_id)
        return ModerationResult(
            False,
            "Excesso de menções detectado.",
            f"📣 Evite mencionar muitas pessoas de uma vez. (ocorrência {strike})",
            "blocked",
            "mention_spam",
            "medium",
            escalation,
        )

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
                entry
                for entry in entries
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
                    return ModerationResult(
                        False,
                        f"A mesma mensagem foi enviada 5 vezes seguidas. Uma ocorrência foi registrada (ocorrência {strike}).",
                        "Ocorrência registrada por repetição excessiva. As 4 mensagens anteriores foram removidas e esta tentativa foi bloqueada.",
                        "duplicate_burst",
                        "duplicate_burst",
                        "medium",
                        escalation,
                    )

                mention_result = _raw_mention_spam_result(self, message, user_id)
                if mention_result:
                    return mention_result

                internal_message = (
                    f"{safe_message} [pokinex-duplicate-check-"
                    f"{count}-{current_message_id or now}]"
                )
                result = original_moderate(self, internal_message, user_id)
                if result.allowed:
                    entries.append((now, normalized, current_message_id))
                return result

            mention_result = _raw_mention_spam_result(self, message, user_id)
            if mention_result:
                return mention_result

            result = original_moderate(self, safe_message, user_id)
            if result.allowed:
                entries.append((now, normalized, current_message_id))
            return result

        mention_result = _raw_mention_spam_result(self, message, user_id)
        if mention_result:
            return mention_result

        return original_moderate(self, safe_message, user_id)

    ModerationBot.moderate = _moderate_with_pokinex_rules

    robotic_messages = {
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

    pokinex_moderate = ModerationBot.moderate

    def _moderate_with_robotic_notices(self, message, user_id=None):
        result = pokinex_moderate(self, message, user_id)
        if result.allowed or not result.category:
            return result

        bot_message = robotic_messages.get(result.category, result.bot_message)
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

    def remaining_mute_seconds(self, user_id) -> int:
        expires = self._muted_until.get(str(user_id))
        if expires is None:
            return 0
        remaining = max(0, int(expires - time.time() + 0.999))
        if remaining == 0:
            self._muted_until.pop(str(user_id), None)
        return remaining

    ModerationBot.remaining_mute_seconds = remaining_mute_seconds

    async def _purge_repeated_messages(websocket: WebSocket, user, message_ids: list[str]):
        for message_id in message_ids:
            try:
                await manager.delete_message(user, message_id, websocket)
            except Exception:
                continue

    original_send_json = WebSocket.send_json

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

        await original_send_json(self, data, *args, **kwargs)

        if cleanup_ids:
            token = self.cookies.get("session")
            current_user = get_user_from_token(token) if token else None
            if current_user:
                await _purge_repeated_messages(self, current_user, cleanup_ids)

    WebSocket.send_json = _send_json_with_moderation_countdown

    original_chat_event_validate = ChatMessageEvent.model_validate

    @classmethod
    def _chat_event_model_validate(cls, obj, *args, **kwargs):
        _current_message_id.set(
            obj.get("messageId") if isinstance(obj, dict) else None
        )
        return original_chat_event_validate(obj, *args, **kwargs)

    ChatMessageEvent.model_validate = _chat_event_model_validate

    moderation_module.is_moderator = _owner_aware_is_moderator
    _INSTALLED = True


__all__ = ["install_moderation_compat"]
