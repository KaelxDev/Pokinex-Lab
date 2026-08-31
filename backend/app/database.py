from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "poknex.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database() -> None:
    connection = get_connection()
    try:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                display_name TEXT NOT NULL,
                avatar TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_user_id
            ON sessions(user_id);

            CREATE TABLE IF NOT EXISTS messages (
                message_id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                edited_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_user_id
            ON messages(user_id);
            """
        )
        connection.commit()
    finally:
        connection.close()


def save_message(message_id: str, user_id: int, message: str, created_at: str) -> None:
    connection = get_connection()
    try:
        connection.execute(
            "INSERT OR IGNORE INTO messages (message_id, user_id, message, created_at) VALUES (?, ?, ?, ?)",
            (message_id, user_id, message, created_at),
        )
        connection.commit()
    finally:
        connection.close()


def get_message_owner(message_id: str) -> int | None:
    connection = get_connection()
    try:
        row = connection.execute(
            "SELECT user_id FROM messages WHERE message_id = ?",
            (message_id,),
        ).fetchone()
        return int(row["user_id"]) if row else None
    finally:
        connection.close()


def update_message(message_id: str, user_id: int, message: str, edited_at: str) -> bool:
    connection = get_connection()
    try:
        cursor = connection.execute(
            "UPDATE messages SET message = ?, edited_at = ? WHERE message_id = ? AND user_id = ?",
            (message, edited_at, message_id, user_id),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        connection.close()
