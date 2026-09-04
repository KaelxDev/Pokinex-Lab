"""Central role definitions for Pokinex accounts."""

OWNER_ID = "1"
OWNER_USERNAME = "kael1nk"


def is_owner(user) -> bool:
    user_id = str(user.get("id", "")).strip()
    username = str(user.get("username", "")).strip().casefold()
    return user_id == OWNER_ID or username == OWNER_USERNAME


def get_user_role(user) -> str:
    if is_owner(user):
        return "owner"
    return "moderator" if _is_configured_moderator(user) else "member"


def _configured_moderator(user) -> bool:
    import os

    ids = {
        item.strip()
        for item in os.getenv("POKINEX_MODERATOR_IDS", "").split(",")
        if item.strip()
    }
    usernames = {
        item.strip().casefold()
        for item in os.getenv("POKINEX_MODERATOR_USERNAMES", "").split(",")
        if item.strip()
    }
    user_id = str(user.get("id", "")).strip()
    username = str(user.get("username", "")).strip().casefold()
    return (bool(user_id) and user_id in ids) or (
        bool(username) and username in usernames
    )
