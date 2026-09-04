from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
import os
import random
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
    action: str | None = None


class ModerationBot:
    PUBLIC_COMMANDS = {
        "!help": "🤖 Comandos: !help, !rules, !bot, !about, !ping, !status, !online, !time, !memory",
        "!rules": "📜 Regras: respeito, nada de spam/scam, abuso ou flood. Em caso de problema, fale com a moderação.",
        "!bot": "🤖 Eu sou o PokiBot, assistente e moderador automático do #geral. Também respondo quando você me menciona.",
        "!about": "🤖 PokiBot • moderação automática • respostas contextuais • memória curta • proteção contra flood.",
        "!ping": "🏓 Pong. PokiBot está online.",
    }
    MOD_HELP = (
        "🛡️ Moderador: !mod, !clear [n], !warn @usuário [motivo], "
        "!mute @usuário [min], !unmute @usuário, !kick @usuário"
    )
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
    MEMORY_MAX_TURNS = 6
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

    def __init__(self):
        self._muted_until: dict[str, float] = {}
        self._message_times: dict[str, deque[float]] = defaultdict(deque)
        self._last_messages: dict[str, tuple[str, float]] = {}
        self._last_bot_reply_at: dict[str, float] = {}
        self._conversation_memory: dict[str, deque[tuple[str, str]]] = defaultdict(
            lambda: deque(maxlen=self.MEMORY_MAX_TURNS)
        )
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

    def _remember_message(self, user_id: int, message: str) -> tuple[bool, bool]:
        key = str(user_id)
        now = time.time()
        timestamps = self._message_times[key]
        while timestamps and now - timestamps[0] > self.FLOOD_WINDOW_SECONDS:
            timestamps.popleft()
        timestamps.append(now)
        normalized = " ".join(message.split()).casefold()
        previous = self._last_messages.get(key)
        duplicate = bool(
            previous
            and previous[0] == normalized
            and now - previous[1] <= self.DUPLICATE_WINDOW_SECONDS
        )
        self._last_messages[key] = (normalized, now)
        return len(timestamps) > self.FLOOD_MAX_MESSAGES, duplicate

    def moderate(self, message: str, user_id: int | None = None) -> ModerationResult:
        self._total_checked += 1
        normalized = " ".join(message.split())
        for pattern in self.BLOCKED_PATTERNS:
            if pattern.search(normalized):
                self._total_blocked += 1
                return ModerationResult(
                    False,
                    "Mensagem bloqueada pela moderação automática.",
                    "⚠️ Essa mensagem foi bloqueada pela moderação automática.",
                    "blocked",
                )
        if user_id is not None:
            flood, duplicate = self._remember_message(user_id, normalized)
            if duplicate and len(normalized) >= 4:
                self._total_blocked += 1
                return ModerationResult(
                    False,
                    "Mensagem repetida detectada.",
                    "⚠️ Evite enviar a mesma mensagem repetidamente.",
                    "duplicate",
                )
            if flood:
                self._total_blocked += 1
                return ModerationResult(
                    False,
                    "Flood detectado.",
                    "🐌 Calma aí. Você está enviando mensagens rápido demais.",
                    "flood",
                )
        return ModerationResult(True)

    def _can_reply(self, user_id: int | None, *, is_follow_up: bool = False) -> bool:
        if user_id is None:
            return True
        if is_follow_up:
            return True
        now = time.time()
        key = str(user_id)
        if now - self._last_bot_reply_at.get(key, 0.0) < self.BOT_REPLY_COOLDOWN_SECONDS:
            return False
        self._last_bot_reply_at[key] = now
        return True

    def _pick(self, values: list[str]) -> str:
        return self._rng.choice(values)

    def _addressed_to_bot(self, text: str) -> tuple[bool, str]:
        cleaned = text
        addressed = False
        for pattern in self.ADDRESS_PATTERNS:
            if pattern.search(cleaned):
                addressed = True
                cleaned = pattern.sub(" ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.!?:;-\t")
        return addressed, cleaned

    def _remember_turn(self, user_id: int | None, role: str, text: str) -> None:
        if user_id is None or not text:
            return
        self._conversation_memory[str(user_id)].append((role, text))

    def _last_bot_message(self, user_id: int | None) -> str | None:
        if user_id is None:
            return None
        for role, text in reversed(self._conversation_memory.get(str(user_id), ())):
            if role == "bot":
                return text
        return None

    def conversational_response(
        self,
        message: str,
        user_id: int | None = None,
        *,
        online_count: int | None = None,
    ) -> str | None:
        text = " ".join(message.strip().split())
        if not text:
            return None

        addressed, cleaned = self._addressed_to_bot(text)
        lowered = cleaned.casefold()
        direct = addressed or lowered.startswith(("pokibot", "poki bot"))
        follow_up = lowered in {"e você", "e voce", "e vc", "e tu", "e contigo"}

        if not direct:
            return None
        if not self._can_reply(user_id, is_follow_up=follow_up):
            return None

        self._remember_turn(user_id, "user", cleaned)
        response: str

        if lowered in self.GREETINGS:
            response = self._pick(self.GREETINGS[lowered])
        elif not lowered:
            response = "🤖 Estou aqui. Use `!help` ou me faça uma pergunta."
        elif any(term in lowered for term in ("como você está", "como voce esta", "tudo bem", "como ta", "como está")):
            response = self._pick([
                "🤖 Operacional e de olho no #geral. Obrigado por perguntar.",
                "🤖 Tudo certo por aqui. Estou online e atento ao canal.",
            ])
        elif follow_up:
            response = "😎 Eu também estou de boa. Continuo online e prestando atenção por aqui."
        elif any(term in lowered for term in ("regras", "qual a regra", "quais as regras")):
            response = self.PUBLIC_COMMANDS["!rules"]
        elif any(term in lowered for term in ("o que você faz", "o que voce faz", "quem é você", "quem voce e")):
            response = self.PUBLIC_COMMANDS["!bot"]
        elif any(term in lowered for term in ("me ajuda", "preciso de ajuda", "comandos", "o que posso fazer")):
            response = "🧭 Posso moderar o canal, detectar spam/flood e responder perguntas simples. Use `!help` para ver minhas funções."
        elif any(term in lowered for term in ("quem está online", "quem esta online", "tem alguém online", "tem alguem online", "quantas pessoas")):
            response = self.online_message(online_count)
        elif any(term in lowered for term in ("que horas", "qual a hora", "horas agora", "hora agora")):
            response = self.time_message()
        elif any(term in lowered for term in self.THANKS):
            response = self._pick(["😎 Tamo junto.", "🤖 Sempre à disposição.", "🫡 É nóis."])
        elif any(term in lowered for term in ("lembra", "memória", "memoria", "o que eu falei", "o que eu disse")):
            response = self.memory_message(user_id=user_id)
        else:
            response = self._pick([
                "🤖 Entendi sua mensagem. Ainda estou aprendendo, mas posso ajudar com `!help`, `!rules`, `!online`, `!time`, `!memory` e `!status`.",
                "🤖 Recebi. Minha especialidade atual é moderar o #geral e responder perguntas simples quando você me chama.",
                "🤖 Estou acompanhando. Tente uma pergunta mais direta ou use `!help` para ver minhas funções.",
            ])

        self._remember_turn(user_id, "bot", response)
        self._last_bot_reply_at[str(user_id)] = time.time() if user_id is not None else 0.0
        return response

    def memory_message(self, user_id: int | None = None) -> str:
        if user_id is None:
            return "🧠 Minha memória curta está disponível durante esta sessão."
        turns = list(self._conversation_memory.get(str(user_id), ()))
        user_turns = [text for role, text in turns if role == "user"]
        if not user_turns:
            return "🧠 Ainda não tenho contexto suficiente desta conversa."
        recent = user_turns[-3:]
        if len(recent) == 1:
            return f"🧠 Lembro que você falou sobre: “{recent[0]}”."
        return "🧠 Das últimas mensagens, lembro de: " + "; ".join(f"“{item}”" for item in recent) + "."

    def online_message(self, online_count: int | None) -> str:
        if online_count is None:
            return "👥 Não consegui consultar a lista de usuários agora."
        if online_count <= 0:
            return "👥 No momento, não há usuários conectados."
        if online_count == 1:
            return "👥 Tem 1 usuário online no Pokinex agora."
        return f"👥 Tem {online_count} usuários online no Pokinex agora."

    def time_message(self) -> str:
        now = datetime.now().astimezone()
        return f"🕒 Agora são {now.strftime('%H:%M:%S')} ({now.strftime('%d/%m/%Y')})."

    def status_message(self) -> str:
        uptime = max(0, int(time.time() - self._started_at))
        hours, remainder = divmod(uptime, 3600)
        minutes, seconds = divmod(remainder, 60)
        return (
            f"📊 PokiBot status • online • uptime {hours:02d}:{minutes:02d}:{seconds:02d} "
            f"• mensagens analisadas: {self._total_checked} • bloqueadas: {self._total_blocked}"
        )

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
