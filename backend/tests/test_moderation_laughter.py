from app.moderation_bot import ModerationBot


def test_long_laughter_is_allowed():
    bot = ModerationBot()
    result = bot.moderate("kkkkkkkkkkkkkkkkkkkk", user_id=101)
    assert result.allowed


def test_mixed_laughter_is_allowed():
    bot = ModerationBot()
    result = bot.moderate("KKKKKKKKKKKKKK kkkkkkkkk", user_id=102)
    assert result.allowed


def test_non_laughter_repetition_is_still_blocked():
    bot = ModerationBot()
    result = bot.moderate("!!!!!!!!!!!!!!!!!!", user_id=103)
    assert not result.allowed
    assert result.category == "repeated_chars"
