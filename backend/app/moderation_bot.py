from dataclasses import dataclass
from datetime import datetime
import random
import re
import unicodedata

from app.roles import is_moderator as role_is_moderator
from app.services.moderation_state import ModerationState


BOT_USER = {
    "id": "moderation-bot",
    "username": "PokiBot",
    "displayName": "PokiBot",
    "avatar": "/pokibot-icon.jpg",
    "status": "online",
    "role": "bot",
}


def is_moderator(user) -> bool:
    """Backward-compatible alias for the central role policy."""
    return role_is_moderator(user)


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
    """PokiBot conversational layer backed by isolated moderation state."""

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

    def __init__(self, state: ModerationState | None = None):
        self.state = state or ModerationState()
        self._rng = random.Random()

    @property
    def FLOOD_WINDOW_SECONDS(self):
        return self.state.__class__.__dict__.get("FLOOD_WINDOW_SECONDS", 8.0)

    @property
    def VIOLATION_WINDOW_SECONDS(self):
        return self.state.VIOLATION_WINDOW_SECONDS

    @property
    def BOT_REPLY_COOLDOWN_SECONDS(self):
        return self.state.BOT_REPLY_COOLDOWN_SECONDS

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

    def _register_violation(self, user_id: int | None) -> tuple[int, int]:
        return self.state.register_violation(user_id)

    def _can_reply(self, user_id: int | None, *, is_follow_up: bool = False) -> bool:
        return self.state.can_bot_reply(user_id, is_follow_up=is_follow_up)

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
        self.state.remember_turn(user_id, role, text)

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
            response = "🧭 Posso moderar o canal, detectar spam/flood, bloquear links suspeitos e responder perguntas simples. Use `!help` para ver minhas funções."
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
        self.state.mark_bot_reply(user_id)
        return response

    def memory_message(self, user_id: int | None = None) -> str:
        if user_id is None:
            return "🧠 Minha memória curta está disponível durante esta sessão."
        recent = self.state.recent_user_turns(user_id)
        if not recent:
            return "🧠 Ainda não tenho contexto suficiente desta conversa."
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
        uptime, checked, categories, blocked = self.state.status_snapshot()
        hours, remainder = divmod(uptime, 3600)
        minutes, seconds = divmod(remainder, 60)
        top_categories = sorted(categories.items(), key=lambda item: item[1], reverse=True)[:4]
        category_text = ", ".join(f"{name}:{count}" for name, count in top_categories) or "nenhuma"
        return (
            f"📊 PokiBot status • online • uptime {hours:02d}:{minutes:02d}:{seconds:02d} "
            f"• analisadas: {checked} • bloqueadas: {blocked} "
            f"• categorias: {category_text}"
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
        self.state.mute(user_id, minutes)

    def unmute(self, user_id: int) -> None:
        self.state.unmute(user_id)

    def is_muted(self, user_id: int) -> bool:
        return self.state.is_muted(user_id)

    def remaining_mute_seconds(self, user_id: int) -> int:
        return self.state.remaining_mute_seconds(user_id)


moderation_bot = ModerationBot()
