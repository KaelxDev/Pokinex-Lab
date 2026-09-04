from app.moderation_bot import ModerationBot


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


def test_duplicate_message_is_blocked():
    bot = ModerationBot()
    assert bot.moderate("uma mensagem repetida", user_id=7).allowed
    result = bot.moderate("uma mensagem repetida", user_id=7)
    assert not result.allowed
    assert result.action == "duplicate"


def test_flood_is_blocked_after_limit():
    bot = ModerationBot()
    results = [bot.moderate(f"mensagem {index}", user_id=9) for index in range(7)]
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
