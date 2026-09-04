"""Database connection and PostgreSQL/SQLite infrastructure.

The module owns connection lifecycle and dialect selection; application-level
message queries remain behind `app.database` for compatibility.
"""

from pathlib import Path
import os
import sqlite3

from app.migrations import migrate

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
BASE_DIR = Path(__file__).resolve().parent.parent
SQLITE_DB_PATH = BASE_DIR / "poknex.db"

PG_POOL_MIN_SIZE = 1
PG_POOL_MAX_SIZE = 5
PG_POOL_TIMEOUT = 10

_pg_pool = None


def using_postgres() -> bool:
    return bool(DATABASE_URL)


def init_db_pool() -> None:
    global _pg_pool

    if not using_postgres() or _pg_pool is not None:
        return

    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool

    _pg_pool = ConnectionPool(
        conninfo=DATABASE_URL,
        kwargs={"row_factory": dict_row},
        min_size=PG_POOL_MIN_SIZE,
        max_size=PG_POOL_MAX_SIZE,
        timeout=PG_POOL_TIMEOUT,
        open=False,
        close_returns=True,
        name="pokinex-pg",
    )
    _pg_pool.open(wait=True, timeout=PG_POOL_TIMEOUT)


def close_db_pool() -> None:
    global _pg_pool

    if _pg_pool is None:
        return

    _pg_pool.close()
    _pg_pool = None


def get_connection():
    if using_postgres():
        if _pg_pool is None:
            raise RuntimeError("PostgreSQL pool não foi inicializado.")
        return _pg_pool.getconn(timeout=PG_POOL_TIMEOUT)

    connection = sqlite3.connect(SQLITE_DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    connection = get_connection()
    try:
        migrate(connection, using_postgres())
    finally:
        connection.close()


def postgres_or_sqlite(postgres_query: str, sqlite_query: str) -> str:
    return postgres_query if using_postgres() else sqlite_query
