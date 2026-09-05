from app.moderation_bot import ModerationBot
from app.services.moderation_engine import ModerationEngine
from app.services.moderation_state import ModerationState


def test_engine_records_block_without_owning_metrics_state():
    state = ModerationState()
    bot = ModerationBot(state=state)
    engine = ModerationEngine(bot=bot)

    decision = engine.moderate("free nitro", user_id=12, message_id="m-1")

    assert decision.result.allowed is False
    assert decision.result.category == "scam"
    assert state.status_snapshot()[1:] == (1, {"scam": 1}, 1)
    assert not hasattr(engine, "_message_times")
    assert not hasattr(engine, "_duplicate_history")
