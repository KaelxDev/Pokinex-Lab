from dataclasses import dataclass
import os
import re
import time
from collections import defaultdict, deque


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
    action: str | None = None


class ModerationBot:
    PUBLIC_COMMANDS = {
        "!help": "🤖 Comandos públicos: !help, !rules, !bot, !about, !ping, !status",
        "!rules": "📜 Regras: respeito, nada de spam/scam, abuso ou flood. Em caso de problema, fale com a moderação.",
        "!bot": "🤖 Eu sou o PokiBot, moderador automático do #geral. Também posso responder quando você me mencionar.",
        "!about": "🤖 PokiBot • moderação automática • respostas contextuais • proteção contra flood.",
        "!ping": "🏓 Pong. PokiBot está online.",
    }
    MOD_HELP = "🛡️ Moderador: !mod, !clear [n], !warn @usuário [motivo], !mute @usuário [min], !unmute @usuário, !kick @usuário"
    BLOCKED_PATTERNS = (
        re.compile(r"\bspam\b", re.IGNORECASE),
        re.compile(r"\bscam\b", re.IGNORECASE),
        re.compile(r"free\s+nitro", re.IGNORECASE),
        re.compile(r"discord\.gg/[a-z0-9]+", re.IGNORECASE),
        re.compile(r"bit\.ly/[a-z0-9]+", re.IGNORECASE),
    )
    FLOOD_WINDOW_SECONDS = 8.0
    FLOOD_MAX_MESSAGES = 6
    DUPLICATE_WINDOW_SECONDS = 20.0
    BOT_REPLY_COOLDOWN_SECONDS = 3.0
    GREETINGS = {
        "oi": "👋 Oi! Eu sou o PokiBot. Pode me mencionar quando precisar.",
        "olá": "👋 Olá! PokiBot na área. Precisa de alguma coisa?",
        "ola": "👋 Olá! PokiBot na área. Precisa de alguma coisa?",
        "hey": "👋 Hey! PokiBot online.",
        "eae": "👋 Eae! Tudo certo por aí?",
        "e aí": "👋 E aí! PokiBot online.",
    }
    ADDRESS_PATTERNS = (
        re.compile(r"@poki\s*bot\b", re.IGNORECASE),
        re.compile(r"\bpoki\s*bot\b", re.IGNORECASE),
    )

    def __init__(self):
        self._muted_until: dict[str, float] = {}
        self._message_times: dict[str, deque[float]] = defaultdict(deque)
        self._last_messages: dict[str, tuple[str, float]] = {}
        self._last_bot_reply_at: dict[str, float] = {}
        self._total_checked = 0
        self._total_blocked = 0
        self._started_at = time.time()

    def command_name(self, message: str) -> str:
        return message.strip().split()[0].lower() if message.strip() else ""

    def public_command(self, message: str) -> str | None:
        command = self.command_name(message)
        if command == "!status":
            return self.status_message()
        return self.PUBLIC_COMMANDS.get(command)

    def _remember_message(self, user_id: int, message: str) -> tuple[bool, bool]:
        key = str(user_id)
        now = time.time()
        timestamps = self._message_times[key]
        while timestamps and now - timestamps[0] > self.FLOOD_WINDOW_SECONDS:
            timestamps.popleft()
        timestamps.append(now)
        normalized = " ".join(message.split()).casefold()
        previous = self._last_messages.get(key)
        duplicate = bool(previous and previous[0] == normalized and now - previous[1] <= self.DUPLICATE_WINDOW_SECONDS)
        self._last_messages[key] = (normalized, now)
        return len(timestamps) > self.FLOOD_MAX_MESSAGES, duplicate

    def moderate(self, message: str, user_id: int | None = None) -> ModerationResult:
        self._total_checked += 1
        normalized = " ".join(message.split())
        for pattern in self.BLOCKED_PATTERNS:
            if pattern.search(normalized):
                self._total_blocked += 1
                return ModerationResult(False, "Mensagem bloqueada pela moderação automática.", "⚠️ Essa mensagem foi bloqueada pela moderação automática.", "blocked")
        if user_id is not None:
            flood, duplicate = self._remember_message(user_id, normalized)
            if duplicate and len(normalized) >= 4:
                self._total_blocked += 1
                return ModerationResult(False, "Mensagem repetida detectada.", "⚠️ Evite enviar a mesma mensagem repetidamente.", "duplicate")
            if flood:
                self._total_blocked += 1
                return ModerationResult(False, "Flood detectado.", "🐌 Calma aí. Você está enviando mensagens rápido demais.", "flood")
        return ModerationResult(True)

    def _can_reply(self, user_id: int | None) -> bool:
        if user_id is None:
            return True
        now = time.time()
        key = str(user_id)
        if now - self._last_bot_reply_at.get(key, 0.0) < self.BOT_REPLY_COOLDOWN_SECONDS:
            return False
        self._last_bot_reply_at[key] = now
        return True

    def _addressed_to_bot(self, text: str) -> tuple[bool, str]:
        cleaned = text
        addressed = False
        for pattern in self.ADDRESS_PATTERNS:
            if pattern.search(cleaned):
                addressed = True
                cleaned = pattern.sub(" ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,:;!?-\t")
        return addressed, cleaned

    def conversational_response(self, message: str, user_id: int | None = None) -> str | None:
        text = " ".join(message.strip().split())
        if not text:
            return None

        addressed, cleaned = self._addressed_to_bot(text)
        lowered = cleaned.casefold()
        direct = addressed or lowered.startswith(("pokibot", "poki bot"))

        if not direct or not self._can_reply(user_id):
            return None

        if lowered in self.GREETINGS:
            return self.GREETINGS[lowered]
        if not lowered:
            return "🤖 Estou aqui. Use `!help` para ver os comandos ou me faça uma pergunta."
        if any(term in lowered for term in ("como você está", "como voce esta", "tudo bem", "como ta", "como está")):
            return "🤖 Operacional e de olho no #geral. Obrigado por perguntar."
        if any(term in lowered for term in ("regras", "qual a regra", "quais as regras")):
            return self.PUBLIC_COMMANDS["!rules"]
        if any(term in lowered for term in ("o que você faz", "o que voce faz", "quem é você", "quem voce e")):
            return self.PUBLIC_COMMANDS["!bot"]
        if any(term in lowered for term in ("obrigado", "obrigada", "valeu")):
            return "😎 Tamo junto."
        return "🤖 Recebi sua mensagem. Ainda estou aprendendo, mas posso responder a `!help`, `!rules`, `!about`, `!ping` e `!status`."

    def status_message(self) -> str:
        uptime = max(0, int(time.time() - self._started_at))
        hours, remainder = divmod(uptime, 3600)
        minutes, seconds = divmod(remainder, 60)
        return f"📊 PokiBot status • online • uptime {hours:02d}:{minutes:02d}:{seconds:02d} • mensagens analisadas: {self._total_checked} • bloqueadas: {self._total_blocked}"

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
