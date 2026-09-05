from app.services.message_runtime import (
    MAX_MESSAGE_OWNERS,
    MAX_PROCESSED_MESSAGE_IDS,
    MessageRuntimeState,
)


def test_processed_message_cache_remains_bounded():
    state = MessageRuntimeState()

    for index in range(MAX_PROCESSED_MESSAGE_IDS + 3):
        state.remember_processed_message(f"message-{index}")

    assert len(state.processed_message_ids) == MAX_PROCESSED_MESSAGE_IDS
    assert "message-0" not in state.processed_message_ids
    assert f"message-{MAX_PROCESSED_MESSAGE_IDS + 2}" in state.processed_message_ids


def test_message_owner_cache_remains_bounded():
    state = MessageRuntimeState()

    for index in range(MAX_MESSAGE_OWNERS + 3):
        state.cache_message_owner(f"message-{index}", index)

    assert len(state.message_owners) == MAX_MESSAGE_OWNERS
    assert "message-0" not in state.message_owners
    assert state.message_owners[f"message-{MAX_MESSAGE_OWNERS + 2}"] == MAX_MESSAGE_OWNERS + 2


def test_forget_operations_remove_runtime_state():
    state = MessageRuntimeState()
    state.remember_processed_message("message-1")
    state.cache_message_owner("message-1", 1)

    state.forget_processed_message("message-1")
    state.forget_message_owner("message-1")

    assert "message-1" not in state.processed_message_ids
    assert "message-1" not in state.message_owners
