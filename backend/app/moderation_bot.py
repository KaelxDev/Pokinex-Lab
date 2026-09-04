from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
import os
import random
import re
import time
import unicodedata


BOT_USER = {
    "id": "moderation-bot",
    "username": "PokiBot",
    "displayName": "PokiBot",
    "avatar": "/pokibot-icon.jpg",
    "status": "online",
    "role": "bot",
}


def _csv_env(name: str) -> set[str]:
    return {
        item.strip().casefold()
        for item in os.getenv(name, "").split(",")
        if item.strip()
    }


def is_moderator(user) -> bool:
    ids = _csv_env("POKINEX_MODERATOR_IDS")
    usernames = _csv_env("POKINEX_MODERATOR_USERNAMES")
    user_id = str(user.get("id", "")).strip()
    username = str(user.get("username", "")).strip().casefold()
    return (bool(user_id) and user_id in ids) or (
        bool(username) and username in usernames
    )


@dataclass(frozen=True)
class ModerationResult:
    allowed: bool
    reason: str | None = None
    bot_message: str | None = None
    action: str | None = None
    category: str | None = None
    severity: str = "low"
    mute_minutes: int = 0


class ModerationBot:
    PUBLIC_COMMANDS = {
        "!help": "🤖 Comandos: !help, !rules, !bot, !about, !ping, !status, !online, !time, !memory",
        "!rules": "📜 Regras: respeito, nada de spam/scam, abuso, flood ou links suspeitos. Em caso de problema, fale com a moderação.",
        "!bot": "🤖 Eu sou o PokiBot, assistente e moderador automático do #geral. Também respondo quando você me menciona.",
        "!about": "🤖 PokiBot • moderação automática em camadas • respostas contextuais • memória curta • proteção contra spam e flood.",
        "!ping": "🏓 Pong. PokiBot está online.",
    }
    MOD_HELP = (
        "🛡️ Staff: !mod, !clear [n|all], !clear @usuário [n|all], "
        "!delete <message_id>, !warn @usuário [motivo], !mute @usuário [min], "
        "!unmute @usuário, !kick @usuário"
    )

    SCAM_PATTERNS = (
        re.compile(r"\bfree\s+nitro\b", re.IGNORECASE),
        re.compile(r"\bnitro\s+(gr[aá]tis|free)\b", re.IGNORECASE),
        re.compile(r"\bganhe\s+(?:discord\s+)?nitro\b", re.IGNORECASE),
        re.compile(r"\b(?:premio|pr[eê]mio|recompensa)\s+(?:gr[aá]tis|exclusiv[oa])\b", re.IGNORECASE),
        re.compile(r"\bverifique\s+sua\s+conta\b.*\b(?:login|senha|password)\b", re.IGNORECASE),
        re.compile(r"\b(?:senha|password|c[oó]digo)\b.*\b(?:verifique|confirme|valid[ea])\b.*\bhttps?://", re.IGNORECASE),
        re.compile(r"\b(?:pix|pagamento)\b.*\b(?:premio|pr[eê]mio|recompensa)\b", re.IGNORECASE),
    )
    SUSPICIOUS_LINK_PATTERNS = (
        re.compile(r"\b(?:bit\.ly|tinyurl\.com|cutt\.ly|is\.gd|t\.co)/\S+", re.IGNORECASE),
        re.compile(r"\bhttps?://\S+\b.*\b(?:senha|login|password|confirmar|verificar|nitro|premio|pix)\b", re.IGNORECASE),
    )
    THREAT_PATTERNS = (
        re.compile(r"\b(?:vou|vai)\s+(?:te\s+)?(?:matar|machucar|ferir)\b", re.IGNORECASE),
        re.compile(r"\b(?:eu\s+)?te\s+mato\b", re.IGNORECASE),
        re.compile(r"\b(?:vou|vai)\s+(?:acabar|dar\s+um\s+fim)\s+(?:com\s+)?você\b", re.IGNORECASE),
    )
    HARASSMENT_PATTERNS = (
        re.compile(r"\b(?:vai\s+se\s+fuder|vai\s+tomar\s+no\s+cu)\b", re.IGNORECASE),
        re.compile(r"\bfilho\s+da\s+puta\b", re.IGNORECASE),
        re.compile(r"\b(?:fdp|ot[aá]rio|idiota|imbecil|retardado)\b", re.IGNORECASE),
    )

    FLOOD_WINDOW_SECONDS = 8.0
    FLOOD_MAX_MESSAGES = 6
    DUPLICATE_WINDOW_SECONDS = 20.0
    DUPLICATE_MIN_LENGTH = 4
    VIOLATION_WINDOW_SECONDS = 120.0
    BOT_REPLY_COOLDOWN_SECONDS = 3.0
    MEMORY_MAX_TURNS = 6
    MAX_NORMALIZED_MESSAGE_LENGTH = 1000
    MAX_LINKS_PER_MESSAGE = 3
    MAX_MENTIONS_PER_MESSAGE = 4
    CAPS_MIN_ALPHA = 10
    CAPS_RATIO_LIMIT = 0.82
    REPEATED_CHARACTER_LIMIT = 8

    GREETINGS = {
        "oi": [
            "👋 Oi! Eu sou o PokiBot. Pode me mencionar quando precisar.",
            "👋 Opa! PokiBot online. Em que posso ajudar?",
        ],
        "olá": [
            "👋 Olá! PokiBot na área. Precisa de alguma coisa?",
            "👋 Olá! Estou por aqui. Manda a pergunta.",
        ],
        "ola": [
            "👋 Olá! PokiBot na área. Precisa de alguma coisa?",
            "👋 Oi! Estou ouvindo.",
        ],
        "hey": ["👋 Hey! PokiBot online.", "🤖 Hey! Tudo certo?"],
        "eae": ["👋 Eae! Tudo certo por aí?", "😎 Eae! PokiBot presente."],
        "e aí": ["👋 E aí! PokiBot online.", "🤖 E aí! Manda a boa."],
    }
    THANKS = ("obrigado", "obrigada", "valeu", "tmj", "tamo junto")
    ADDRESS_PATTERNS = (
        re.compile(r"@poki\s*bot\b", re.IGNORECASE),
        re.compile(r"\bpoki\s*bot\b", re.IGNORECASE),
    )
    LEET_TRANSLATION = str.maketrans({
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "$": "s",
    })

    def __init__(self):
        self._muted_until: dict[str, float] = {}
        self._message_times: dict[str, deque[float]] = defaultdict(deque)
        self._last_messages: dict[str, tuple[str, float]] = {}
        self._violation_times: dict[str, deque[float]] = defaultdict(deque)
        self._last_bot_reply_at: dict[str, float] = {}
        self._conversation_memory: dict[str, deque[tuple[str, str]]] = defaultdict(
            lambda: deque(maxlen=self.MEMORY_MAX_TURNS)
        )
        self._categories: dict[str, int] = defaultdict(int)
        self._total_checked = 0
        self._total_blocked = 0
        self._started_at = time.time()
        self._rng = random.Random()

    def command_name(self, message: str) -> str:
        return message.strip().split()[0].lower() if message.strip() else ""

    def public_command(
        self,
        message: str,
        *,
        online_count: int | None = None,
        user_id: int | None = None,
    ) -> str | None:
        command = self.command_name(message)
        if command == "!status":
            return self.status_message()
        if command == "!online":
            return self.online_message(online_count)
        if command == "!time":
            return self.time_message()
        if command == "!memory":
            return self.memory_message(user_id=user_id)
        return self.PUBLIC_COMMANDS.get(command)

    @classmethod
    def normalize_for_moderation(cls, message: str) -> str:
        normalized = unicodedata.normalize("NFKC", message)
        normalized = normalized.translate(cls.LEET_TRANSLATION)
        normalized = re.sub(r"[\u200b-\u200f\u202a-\u202e\u2060\ufeff]", "", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    @staticmethod
    def _link_count(message: str) -> int:
        return len(re.findall(r"https?://\S+|www\.\S+", message, flags=re.IGNORECASE))

    @staticmethod
    def _mention_count(message: str) -> int:
        return len(re.findall(r"@[A-Za-z0-9_.-]{2,32}", message))

    @classmethod
    def _caps_ratio(cls, message: str) -> float:
        letters = [char for char in message if char.isalpha()]
        if len(letters) < cls.CAPS_MIN_ALPHA:
            return 0.0
        upper = sum(1 for char in letters if char.isupper())
        return upper / len(letters)

    def _remember_message(self, user_id: int, message: str) -> tuple[bool, bool]:
        key = str(user_id)
        now = time.time()
        timestamps = self._message_times[key]
        while timestamps and now - timestamps[0] > self.FLOOD_WINDOW_SECONDS:
            timestamps.popleft()
        timestamps.append(now)
        normalized = self.normalize_for_moderation(message).casefold()
        previous = self._last_messages.get(key)
        duplicate = bool(
            previous
            and previous[0] == normalized
            and now - previous[1] <= self.DUPLICATE_WINDOW_SECONDS
        )
        self._last_messages[key] = (normalized, now)
        return len(timestamps) > self.FLOOD_MAX_MESSAGES, duplicate

    def _register_violation(self, user_id: int | None) -> tuple[int, int]:
        if user_id is None:
            return 1, 0
        key = str(user_id)
        now = time.time()
        violations = self._violation_times[key]
        while violations and now - violations[0] > self.VIOLATION_WINDOW_SECONDS:
            violations.popleft()
        violations.append(now)
        strike = len(violations)
        mute_minutes = {1: 0, 2: 1, 3: 5}.get(strike, 15)
        return strike, mute_minutes

    def moderate(self, message: str, user_id: int | None = None) -> ModerationResult:
        self._total_checked += 1
        normalized = self.normalize_for_moderation(message)
        folded = normalized.casefold()

        if len(normalized) > self.MAX_NORMALIZED_MESSAGE_LENGTH:
            self._total_blocked += 1
            self._categories["length"] += 1
            return ModerationResult(False, "Mensagem acima do limite permitido.", "✂️ Essa mensagem é grande demais para o #geral.", "blocked", "length", "medium", 0)

        for pattern in self.SCAM_PATTERNS:
            if pattern.search(normalized):
                self._total_blocked += 1
                self._categories["scam"] += 1
                strike, escalation = self._register_violation(user_id)
                return ModerationResult(False, "Possível golpe/phishing detectado.", f"🚨 Possível golpe detectado. Mensagem bloqueada. (ocorrência {strike})", "blocked", "scam", "high", max(5, escalation))

        for pattern in self.SUSPICIOUS_LINK_PATTERNS:
            if pattern.search(normalized):
                self._total_blocked += 1
                self._categories["suspicious_link"] += 1
                strike, escalation = self._register_violation(user_id)
                return ModerationResult(False, "Link potencialmente suspeito.", f"🔗 O link foi bloqueado por segurança. (ocorrência {strike})", "blocked", "suspicious_link", "high", max(5, escalation))

        for pattern in self.THREAT_PATTERNS:
            if pattern.search(normalized):
                self._total_blocked += 1
                self._categories["threat"] += 1
                strike, escalation = self._register_violation(user_id)
                return ModerationResult(False, "Ameaça detectada.", f"🛑 Essa mensagem foi bloqueada por conter uma ameaça. (ocorrência {strike})", "blocked", "threat", "high", max(5, escalation))

        for pattern in self.HARASSMENT_PATTERNS:
            if pattern.search(normalized):
                self._total_blocked += 1
                self._categories["harassment"] += 1
                strike, escalation = self._register_violation(user_id)
                return ModerationResult(False, "Abuso ou assédio detectado.", f"⚠️ Evite ataques pessoais e linguagem abusiva. (ocorrência {strike})", "blocked", "harassment", "medium", escalation)

        link_count = self._link_count(normalized)
        if link_count > self.MAX_LINKS_PER_MESSAGE:
            self._total_blocked += 1
            self._categories["link_spam"] += 1
            strike, escalation = self._register_violation(user_id)
            return ModerationResult(False, "Excesso de links na mensagem.", f"🔗 Evite enviar vários links de uma vez. (ocorrência {strike})", "blocked", "link_spam", "medium", escalation)

        mention_count = self._mention_count(normalized)
        if mention_count > self.MAX_MENTIONS_PER_MESSAGE:
            self._total_blocked += 1
            self._categories["mention_spam"] += 1
            strike, escalation = self._register_violation(user_id)
            return ModerationResult(False, "Excesso de menções detectado.", f"📣 Evite mencionar muitas pessoas de uma vez. (ocorrência {strike})", "blocked", "mention_spam", "medium", escalation)

        if self._caps_ratio(normalized) >= self.CAPS_RATIO_LIMIT and len(normalized) >= 14:
            self._total_blocked += 1
            self._categories["caps"] += 1
            strike, escalation = self._register_violation(user_id)
            return ModerationResult(False, "Excesso de texto em caixa alta.", f"🔈 Evite escrever tudo em CAPS. (ocorrência {strike})", "blocked", "caps", "low", escalation)

        if re.search(r"(.)\1{" + str(self.REPEATED_CHARACTER_LIMIT) + r",}", normalized, flags=re.IGNORECASE):
            self._total_blocked += 1
            self._categories["repeated_chars"] += 1
            strike, escalation = self._register_violation(user_id)
            return ModerationResult(False, "Repetição excessiva de caracteres detectada.", f"🔁 Evite repetir caracteres excessivamente. (ocorrência {strike})", "blocked", "repeated_chars", "low", escalation)

        if user_id is not None:
            flood, duplicate = self._remember_message(user_id, folded)
            if duplicate and len(folded) >= self.DUPLICATE_MIN_LENGTH:
                self._total_blocked += 1
                self._categories["duplicate"] += 1
                strike, escalation = self._register_violation(user_id)
                return ModerationResult(False, "Mensagem duplicada detectada.", f"🔁 Evite repetir a mesma mensagem. (ocorrência {strike})", "blocked", "duplicate", "low", escalation)
            if flood:
                self._total_blocked += 1
                self._categories["flood"] += 1
                strike, escalation = self._register_violation(user_id)
                return ModerationResult(False, "Flood detectado.", f"⏱️ Você está enviando mensagens rápido demais. (ocorrência {strike})", "blocked", "flood", "medium", escalation)

        return ModerationResult(True)

    def mute(self, user_id: int, minutes: int) -> None:
        self._muted_until[str(user_id)] = time.time() + minutes * 60

    def unmute(self, user_id: int) -> None:
        self._muted_until.pop(str(user_id), None)

    def is_muted(self, user_id: int) -> bool:
        return self.remaining_mute_seconds(user_id) > 0

    def remaining_mute_seconds(self, user_id: int) -> int:
        expires = self._muted_until.get(str(user_id))
        if expires is None:
            return 0
        remaining = max(0, int(expires - time.time() + 0.999))
        if remaining == 0:
            self._muted_until.pop(str(user_id), None)
        return remaining

    def status_message(self) -> str:
        uptime = int(max(0, time.time() - self._started_at))
        minutes, seconds = divmod(uptime, 60)
        return (
            f"🤖 PokiBot online • uptime {minutes}m {seconds}s • "
            f"verificadas {self._total_checked} • bloqueadas {self._total_blocked}"
        )

    @staticmethod
    def online_message(online_count: int | None) -> str:
        if online_count is None:
            return "👥 Contagem de usuários online indisponível no momento."
        return f"👥 Usuários online: {online_count}."

    @staticmethod
    def time_message() -> str:
        return f"🕒 Horário do servidor: {datetime.now().astimezone().strftime('%d/%m/%Y %H:%M:%S %z')}"

    def memory_message(self, user_id: int | None = None) -> str:
        if user_id is None:
            return "🧠 Memória curta indisponível sem uma sessão de usuário."
        memory = self._conversation_memory.get(str(user_id))
        turns = len(memory or ())
        return f"🧠 Memória curta ativa: {turns}/{self.MEMORY_MAX_TURNS} turno(s)."

    def conversational_response(self, message: str, user_id: int, *, online_count: int | None = None) -> str | None:
        normalized = self.normalize_for_moderation(message).casefold()
        now = time.time()
        key = str(user_id)
        if now - self._last_bot_reply_at.get(key, 0) < self.BOT_REPLY_COOLDOWN_SECONDS:
            return None

        response = None
        if normalized in self.GREETINGS:
            response = self._rng.choice(self.GREETINGS[normalized])
        elif normalized in self.THANKS:
            response = self._rng.choice(["🤝 Tamo junto!", "😎 Disponha.", "🤖 Sempre que precisar."])
        elif normalized.startswith("quantos") and "online" in normalized:
            response = self.online_message(online_count)
        elif any(pattern.search(message) for pattern in self.ADDRESS_PATTERNS):
            response = "🤖 Estou ouvindo. Manda a pergunta."

        if response:
            self._last_bot_reply_at[key] = now
            return response
        return None
