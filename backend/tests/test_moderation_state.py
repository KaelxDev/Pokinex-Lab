from app.moderation_bot import ModerationBot
from app.services.moderation_engine import ModerationEngine
from app.services.moderation_state import ModerationState


def test_moderation_state_tracks_mute_and_violations():
    state = ModerationState()

    assert state.is_muted(7) is False
    strike, mute_minutes = state.register_violation(7)

    assert strike == 1
    assert mute_minutes == 0

    state.mute(7, 1)
    assert state.is_muted(7) is True
    assert state.remaining_mute_seconds(7) > 0

    state.unmute(7)
    assert state.is_muted(7) is False


def test_engine_uses_injected_state_for_policy_runtime():
    state = ModerationState()
    bot = ModerationBot(state=state)
    engine = ModerationEngine(bot=bot)

    decision = engine.moderate("free nitro", user_id=12, message_id="m-1")

    assert decision.result.allowed is False
    assert decision.result.category == "scam"
    assert state.status_snapshot()[1] == 1
    assert state.status_snapshot()[3] == 1


def test_state_owns_duplicate_and_flood_history():
    state = ModerationState()

    for index in range(4):
        count, cleanup = state.duplicate_count(
            3,
            "mesma mensagem",
            f"m-{index}",
            100.0 + index,
            threshold=5,
        )
        assert count == index + 1
        assert cleanup == ()

    count, cleanup = state.duplicate_count(
        3,
        "mesma mensagem",
        "m-4",
        104.0,
        threshold=5,
    )

    assert count == 5
    assert cleanup == ("m-0", "m-1", "m-2", "m-3")
    assert state.record_message_time(3, 100.0) == 1
    assert state.record_message_time(3, 101.0) == 2
