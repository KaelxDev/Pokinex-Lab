import app.roles as roles


def test_owner_role_has_priority(monkeypatch):
    monkeypatch.setenv("POKINEX_MODERATOR_IDS", "1")

    user = {"id": 1, "username": "someone"}

    assert roles.is_owner(user)
    assert roles.get_user_role(user) == "owner"


def test_configured_moderator_by_id(monkeypatch):
    monkeypatch.setenv("POKINEX_MODERATOR_IDS", "42")
    monkeypatch.delenv("POKINEX_MODERATOR_USERNAMES", raising=False)

    user = {"id": 42, "username": "moderator"}

    assert roles.is_moderator(user)
    assert roles.get_user_role(user) == "moderator"


def test_configured_moderator_by_username(monkeypatch):
    monkeypatch.delenv("POKINEX_MODERATOR_IDS", raising=False)
    monkeypatch.setenv("POKINEX_MODERATOR_USERNAMES", "TeamLead")

    user = {"id": 99, "username": "teamlead"}

    assert roles.is_moderator(user)
    assert roles.get_user_role(user) == "moderator"


def test_unconfigured_user_is_member(monkeypatch):
    monkeypatch.delenv("POKINEX_MODERATOR_IDS", raising=False)
    monkeypatch.delenv("POKINEX_MODERATOR_USERNAMES", raising=False)

    user = {"id": 99, "username": "member"}

    assert not roles.is_owner(user)
    assert not roles.is_moderator(user)
    assert roles.get_user_role(user) == "member"
