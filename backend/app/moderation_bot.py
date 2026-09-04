from dataclasses import dataclass
import os
import re
import time


BOT_USER = {
    "id": "moderation-bot",
    "username": "PokiBot",
    "displayName": "PokiBot",
    "avatar": "/pokibot-icon.jpg",
    "status": "online",
    "role": "bot",
}


def _csv_env(name: str) -> set[str]:
    return {item.strip().casefold() for item in os.getenv(name, "").split(",") if item.strip()}


def is_moderator(user) -> bool:
    ids = _csv_env("POKINEX_MODERATOR_IDS")
    usernames = _csv_env("POKINEX_MODERATOR_USERNAMES")
    user_id = str(user.get("id", "")).strip()
    username = str(user.get("username", "")).strip().casefold()
    return (bool(user_id) and user_id in ids) or (bool(username) and username in usernames)


@dataclass(frozen=True)
class ModerationResult:
    allowed: bool
    reason: str | None = None
    bot_message: str | None = None


class ModerationBot:
    PUBLIC_COMMANDS = {
        "!help": "🤖 Comandos: !help, !rules, !bot, !about",
        "!rules": "📜 Regras: respeito, nada de spam/scam, abuso ou flood.",
        "!bot": "🤖 Eu sou o PokiBot, moderador automático do #geral.",
        "!about": "🤖 PokiBot • moderação automática • sempre online.",
    }
    MOD_HELP = (
        "🛡️ Moderador: !mod, !clear [n], !warn @usuário [motivo], "
        "!mute @usuário [min], !unmute @usuário, !kick @usuário"
    )
    BLOCKED_PATTERNS = (
        re.compile(r"\bspam\b", re.IGNORECASE),
        re.compile(r"\bscam\b", re.IGNORECASE),
    )

    def __init__(self):
        self._muted_until: dict[str, float] = {}

    def command_name(self, message: str) -> str:
        return message.strip().split()[0].lower() if message.strip() else ""

    def public_command(self, message: str) -> str | None:
        return self.PUBLIC_COMMANDS.get(self.command_name(message))

    def moderate(self, message: str) -> ModerationResult:
        normalized = " ".join(message.split())
        for pattern in self.BLOCKED_PATTERNS:
            if pattern.search(normalized):
                return ModerationResult(False, "Mensagem bloqueada pela moderação automática.", "⚠️ Essa mensagem foi bloqueada pela moderação automática.")
        return ModerationResult(True)

    def parse_target(self, message: str):
        parts = message.strip().split(maxsplit=2)
        if len(parts) < 2:
            return None, "Informe um usuário no formato @username."
        target = parts[1].lstrip("@").strip()
        if not re.fullmatch(r"[A-Za-z0-9_.-]{3,30}", target):
            return None, "Usuário inválido."
        return target.casefold(), parts[2].strip() if len(parts) > 2 else ""

    def mute(self, user_id: int, minutes: int) -> None:
        self._muted_until[str(user_id)] = time.time() + (minutes * 60)

    def unmute(self, user_id: int) -> None:
        self._muted_until.pop(str(user_id), None)

    def is_muted(self, user_id: int) -> bool:
        key = str(user_id)
        expires = self._muted_until.get(key)
        if expires is None:
            return False
        if time.time() >= expires:
            self._muted_until.pop(key, None)
            return False
        return True


moderation_bot = ModerationBot()
