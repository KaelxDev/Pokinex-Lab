from app.services.history_cursor import decode_cursor, encode_cursor


def test_history_cursor_round_trip():
    cursor = encode_cursor("2026-09-05T12:34:56+00:00", "message-42")
    assert decode_cursor(cursor) == ("2026-09-05T12:34:56+00:00", "message-42")


def test_history_cursor_rejects_invalid_values():
    assert decode_cursor(None) is None
    assert decode_cursor("") is None
    assert decode_cursor("not-a-cursor") is None
