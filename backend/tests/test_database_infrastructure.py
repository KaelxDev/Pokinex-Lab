from app.infrastructure.database import postgres_or_sqlite, using_postgres


def test_postgres_configuration_defaults_to_sqlite(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert using_postgres() is False


def test_postgres_or_sqlite_selects_sqlite_when_postgres_is_disabled():
    assert postgres_or_sqlite("postgres", "sqlite") == "sqlite"
