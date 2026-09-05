from app.moderation_bot import ModerationBot
from app.services.moderation_engine import ModerationEngine


def test_long_laughter_is_allowed():
    engine = ModerationEngine(ModerationBot())
    result = engine.moderate("kkkkkkkkkkkkkkkkkkkk", user_id=101).result
    assert result.allowed


def test_mixed_laughter_is_allowed():
    engine = ModerationEngine(ModerationBot())
    result = engine.moderate("KKKKKKKKKKKKKK kkkkkkkkk", user_id=102).result
    assert result.allowed


def test_non_laughter_repetition_is_still_blocked():
    engine = ModerationEngine(ModerationBot())
    result = engine.moderate("!!!!!!!!!!!!!!!!!!", user_id=103).result
    assert not result.allowed
    assert result.category == "repeated_chars"
