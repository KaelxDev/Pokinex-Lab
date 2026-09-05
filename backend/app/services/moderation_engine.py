"""Deterministic moderation policy used by the public chat service."""

from dataclasses import dataclass
import re
import time
import unicodedata

from app.moderation_bot import ModerationBot, ModerationResult, moderation_bot


_ZERO_WIDTH = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060\ufeff]")
_LAUGHTER_RUN = re.compile(r"([kha])\1{8,}", re.IGNORECASE)
_LEET_TRANSLATION = str.maketrans({
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "$": "s",
})

ROBOTIC_MODERATION_MESSAGES = {
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


@dataclass(frozen=True)
class ModerationDecision:
    result: ModerationResult
    cleanup_message_ids: tuple[str, ...] = ()


class ModerationEngine:
    """Application-level moderation policy independent from bot state storage."""

    DUPLICATE_THRESHOLD = 5

    def __init__(self, bot: ModerationBot | None = None):
        self.bot = bot or moderation_bot
        self.state = self.bot.state

    @staticmethod
    def normalize(message: str) -> str:
        normalized = unicodedata.normalize("NFKC", message)
        normalized = normalized.translate(_LEET_TRANSLATION)
        normalized = _ZERO_WIDTH.sub("", normalized)
        return re.sub(r"\s+", " ", normalized).strip()

    @staticmethod
    def _mention_count(message: str) -> int:
        return len(re.findall(r"@[A-Za-z0-9_.-]{2,32}", message))

    @staticmethod
    def _link_count(message: str) -> int:
        return len(re.findall(r"https?://\S+|www\.\S+", message, re.IGNORECASE))

    @staticmethod
    def _caps_ratio(message: str) -> float:
        letters = [char for char in message if char.isalpha()]
        if not letters:
            return 0.0
        return sum(char.isupper() for char in letters) / len(letters)

    def _record_block(
        self,
        category: str,
        reason: str,
        user_id: int | None,
        severity: str,
        *,
        mute_floor: int | None = None,
        action: str = "blocked",
    ) -> ModerationResult:
        self.state.record_blocked(category)
        strike, escalation = self.state.register_violation(user_id)
        mute_minutes = escalation
        if mute_floor is not None:
            mute_minutes = max(mute_floor, escalation)
        bot_message = ROBOTIC_MODERATION_MESSAGES.get(category)
        if category != "duplicate_burst" and bot_message:
            bot_message = f"{bot_message} (ocorrência {strike})"
        return ModerationResult(
            False,
            reason,
            bot_message,
            action,
            category,
            severity,
            mute_minutes,
        )

    def _check_duplicate_burst(
        self,
        user_id: int,
        normalized: str,
        message_id: str | None,
        now: float,
    ) -> ModerationDecision | None:
        count, cleanup_ids = self.state.duplicate_count(
            user_id,
            normalized,
            message_id,
            now,
            self.DUPLICATE_THRESHOLD,
            self.bot.DUPLICATE_WINDOW_SECONDS,
        )
        if count < self.DUPLICATE_THRESHOLD:
            return None

        result = self._record_block(
            "duplicate_burst",
            "A mesma mensagem foi enviada 5 vezes seguidas.",
            user_id,
            "medium",
            action="duplicate_burst",
        )
        return ModerationDecision(result, cleanup_ids)

    def _check_flood(self, user_id: int, now: float) -> ModerationResult | None:
        message_count = self.state.record_message_time(
            user_id,
            now,
            self.bot.FLOOD_WINDOW_SECONDS,
        )
        if message_count <= self.bot.FLOOD_MAX_MESSAGES:
            return None
        return self._record_block(
            "flood",
            "Flood detectado.",
            user_id,
            "medium",
            action="flood",
        )

    def moderate(
        self,
        message: str,
        user_id: int | None = None,
        message_id: str | None = None,
    ) -> ModerationDecision:
        self.state.record_checked()
        normalized = self.normalize(message)
        safe_message = _LAUGHTER_RUN.sub(lambda match: match.group(1) * 4, message)
        safe_normalized = self.normalize(safe_message)

        if len(normalized) > self.bot.MAX_NORMALIZED_MESSAGE_LENGTH:
            return ModerationDecision(
                self._record_block(
                    "length",
                    "Mensagem acima do limite permitido.",
                    user_id,
                    "medium",
                )
            )

        for pattern in self.bot.SCAM_PATTERNS:
            if pattern.search(normalized):
                return ModerationDecision(
                    self._record_block(
                        "scam",
                        "Possível golpe/phishing detectado.",
                        user_id,
                        "high",
                        mute_floor=5,
                    )
                )

        for pattern in self.bot.SUSPICIOUS_LINK_PATTERNS:
            if pattern.search(normalized):
                return ModerationDecision(
                    self._record_block(
                        "suspicious_link",
                        "Link potencialmente suspeito.",
                        user_id,
                        "high",
                        mute_floor=5,
                    )
                )

        for pattern in self.bot.THREAT_PATTERNS:
            if pattern.search(normalized):
                return ModerationDecision(
                    self._record_block(
                        "threat",
                        "Ameaça detectada.",
                        user_id,
                        "high",
                        mute_floor=5,
                    )
                )

        for pattern in self.bot.HARASSMENT_PATTERNS:
            if pattern.search(normalized):
                return ModerationDecision(
                    self._record_block(
                        "harassment",
                        "Abuso ou assédio detectado.",
                        user_id,
                        "medium",
                    )
                )

        if self._link_count(normalized) > self.bot.MAX_LINKS_PER_MESSAGE:
            return ModerationDecision(
                self._record_block(
                    "link_spam",
                    "Excesso de links na mensagem.",
                    user_id,
                    "medium",
                )
            )

        mention_source = _ZERO_WIDTH.sub("", message)
        if self._mention_count(mention_source) > self.bot.MAX_MENTIONS_PER_MESSAGE:
            return ModerationDecision(
                self._record_block(
                    "mention_spam",
                    "Excesso de menções detectado.",
                    user_id,
                    "medium",
                )
            )

        if (
            self._caps_ratio(normalized) >= self.bot.CAPS_RATIO_LIMIT
            and len(normalized) >= 14
        ):
            return ModerationDecision(
                self._record_block(
                    "caps",
                    "Excesso de texto em caixa alta.",
                    user_id,
                    "low",
                )
            )

        if re.search(
            r"(.)\1{" + str(self.bot.REPEATED_CHARACTER_LIMIT) + r",}",
            safe_normalized,
            flags=re.IGNORECASE,
        ):
            return ModerationDecision(
                self._record_block(
                    "repeated_chars",
                    "Repetição excessiva de caracteres detectada.",
                    user_id,
                    "low",
                )
            )

        if user_id is not None:
            now = time.time()
            duplicate_decision = self._check_duplicate_burst(
                user_id,
                normalized.casefold(),
                message_id,
                now,
            )
            if duplicate_decision is not None:
                return duplicate_decision

            flood = self._check_flood(user_id, now)
            if flood is not None:
                self.state.clear_duplicate_history(user_id)
                return ModerationDecision(flood)

        return ModerationDecision(ModerationResult(True))

    def mute(self, user_id: int, minutes: int) -> None:
        self.state.mute(user_id, minutes)

    def unmute(self, user_id: int) -> None:
        self.state.unmute(user_id)

    def is_muted(self, user_id: int) -> bool:
        return self.state.is_muted(user_id)

    def remaining_mute_seconds(self, user_id: int) -> int:
        return self.state.remaining_mute_seconds(user_id)


moderation_engine = ModerationEngine()

__all__ = [
    "ModerationDecision",
    "ModerationEngine",
    "moderation_engine",
    "ROBOTIC_MODERATION_MESSAGES",
]
