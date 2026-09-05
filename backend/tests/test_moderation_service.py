"""Service-layer tests for moderation utilities."""

import pytest

from app.services.moderation_commands import command_args, parse_clear_limit


def test_parse_clear_limit_accepts_default_and_all():
    assert parse_clear_limit(None) is None
    assert parse_clear_limit("all") is None
    assert parse_clear_limit("25") == 25


@pytest.mark.parametrize("value", ["0", "101", "abc", "-1"])
def test_parse_clear_limit_rejects_invalid_values(value):
    with pytest.raises(ValueError):
        parse_clear_limit(value)


def test_command_args_preserves_simple_whitespace_split():
    assert command_args("  !mute   @kael  15 ") == ["!mute", "@kael", "15"]
