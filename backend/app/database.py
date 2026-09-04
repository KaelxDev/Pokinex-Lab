"""Compatibility facade for database infrastructure and repositories.

New code should import database infrastructure from `app.infrastructure.database`
and entity-specific persistence from `app.repositories`.
"""

from app.infrastructure.database import (
    close_db_pool,
    get_connection,
    initialize_database,
    init_db_pool,
    postgres_or_sqlite,
    using_postgres,
)
from app.repositories.message_repository import (
    delete_message,
    get_message,
    get_message_owner,
    get_reactions,
    save_message,
    toggle_reaction,
    update_message,
)
from app.repositories.user_repository import (
    persistent_avatar_reference,
    profile_from_row,
)

_persistent_avatar_reference = persistent_avatar_reference
_profile_from_row = profile_from_row

__all__ = [
    "close_db_pool",
    "get_connection",
    "initialize_database",
    "init_db_pool",
    "postgres_or_sqlite",
    "using_postgres",
    "persistent_avatar_reference",
    "profile_from_row",
    "_persistent_avatar_reference",
    "_profile_from_row",
    "delete_message",
    "get_message",
    "get_message_owner",
    "get_reactions",
    "save_message",
    "toggle_reaction",
    "update_message",
]
