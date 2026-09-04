"""Compatibility facade for database infrastructure and chat repositories.

New code should import infrastructure helpers from `app.infrastructure.database`
and message persistence from `app.repositories.message_repository`.
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
    _persistent_avatar_reference,
    _profile_from_row,
    delete_message,
    get_message,
    get_message_owner,
    get_reactions,
    save_message,
    toggle_reaction,
    update_message,
)

__all__ = [
    "close_db_pool",
    "get_connection",
    "initialize_database",
    "init_db_pool",
    "postgres_or_sqlite",
    "using_postgres",
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
