from app.moderation_bot import ModerationBot
from app.services.moderation_engine import ModerationEngine


def test_mention_returns_conversational_response():
    bot = ModerationBot()
    response = bot.conversational_response("@PokiBot, quem é você?", user_id=1)
    assert response is not None
    assert "PokiBot" in response


def test_unmentioned_message_is_ignored():
    bot = ModerationBot()
    assert bot.conversational_response("oi pessoal", user_id=1) is None


def test_online_command_uses_supplied_count():
    bot = ModerationBot()
    response = bot.public_command("!online", online_count=3)
    assert response == "👥 Tem 3 usuários online no Pokinex agora."


def test_duplicate_burst_is_blocked_on_fifth_message():
    engine = ModerationEngine(ModerationBot())
    results = [
        engine.moderate(
            "uma mensagem repetida",
            user_id=7,
            message_id=f"msg-{index}",
        ).result
        for index in range(5)
    ]
    assert all(result.allowed for result in results[:4])
    assert not results[4].allowed
    assert results[4].action == "duplicate_burst"


def test_flood_is_blocked_after_limit():
    engine = ModerationEngine(ModerationBot())
    results = [
        engine.moderate(
            f"mensagem {index}",
            user_id=9,
            message_id=f"msg-{index}",
        ).result
        for index in range(7)
    ]
    assert all(result.allowed for result in results[:6])
    assert not results[6].allowed
    assert results[6].action == "flood"


def test_short_term_memory_supports_follow_up_question():
    bot = ModerationBot()
    first = bot.conversational_response("@PokiBot como você está?", user_id=12)
    assert first is not None

    second = bot.conversational_response("@PokiBot e você?", user_id=12)
    assert second is not None
    assert "também" in second.lower() or "online" in second.lower()


def test_memory_message_reports_recent_context():
    bot = ModerationBot()
    bot.conversational_response("@PokiBot oi", user_id=20)
    bot.conversational_response("@PokiBot me ajuda", user_id=20)

    response = bot.memory_message(user_id=20)
    assert response is not None
    assert "oi" in response.lower() or "me ajuda" in response.lower()


def test_memory_is_isolated_per_user():
    bot = ModerationBot()
    bot.conversational_response("@PokiBot oi", user_id=1)
    assert bot.memory_message(user_id=2) == "🧠 Ainda não tenho contexto suficiente desta conversa."


def test_normalization_handles_leetspeak_and_invisible_characters():
    normalized = ModerationBot.normalize_for_moderation("fr3e n1tr0\u200b")
    assert "free nitro" in normalized.casefold()


def test_scam_is_blocked_and_can_escalate_to_mute():
    engine = ModerationEngine(ModerationBot())
    result = engine.moderate(
        "Ganhe free nitro agora https://example.com",
        user_id=33,
    ).result
    assert not result.allowed
    assert result.category == "scam"
    assert result.severity == "high"
    assert result.mute_minutes >= 5


def test_threat_is_blocked():
    engine = ModerationEngine(ModerationBot())
    result = engine.moderate("vou te matar", user_id=44).result
    assert not result.allowed
    assert result.category == "threat"
    assert result.severity == "high"


def test_excessive_mentions_are_blocked():
    engine = ModerationEngine(ModerationBot())
    result = engine.moderate(
        "@um @dois @tres @quatro @cinco olha isso",
        user_id=55,
    ).result
    assert not result.allowed
    assert result.category == "mention_spam"


def test_repeated_characters_are_blocked():
    engine = ModerationEngine(ModerationBot())
    result = engine.moderate("!!!!!!!!!!!!!!!!!!", user_id=66).result
    assert not result.allowed
    assert result.category == "repeated_chars"


def test_second_violation_gets_progressive_mute():
    engine = ModerationEngine(ModerationBot())
    first = engine.moderate("vai se fuder", user_id=77).result
    second = engine.moderate("vai se fuder de novo", user_id=77).result
    assert not first.allowed
    assert not second.allowed
    assert second.mute_minutes == 1
