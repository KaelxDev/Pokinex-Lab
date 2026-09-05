from pathlib import Path

import app.infrastructure.database as database


def test_postgres_configuration_defaults_to_sqlite(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert database.using_postgres() is False


def test_postgres_or_sqlite_selects_sqlite_when_postgres_is_disabled():
    assert database.postgres_or_sqlite("postgres", "sqlite") == "sqlite"


def test_sqlite_database_path_remains_at_backend_root():
    assert database.SQLITE_DB_PATH == Path(__file__).resolve().parents[1] / "poknex.db"
