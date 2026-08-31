from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "poknex.db"


def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    connection = get_connection()
    try:
        connection.executescript("""
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, display_name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS messages (message_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, edited_at TEXT, deleted_at TEXT, reply_to_message_id TEXT);
        CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
        CREATE TABLE IF NOT EXISTS message_reactions (message_id TEXT NOT NULL, user_id INTEGER NOT NULL, reaction TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (message_id, user_id, reaction), FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
        CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON message_reactions(message_id);
        """)
        for statement in ("ALTER TABLE messages ADD COLUMN deleted_at TEXT", "ALTER TABLE messages ADD COLUMN reply_to_message_id TEXT"):
            try: connection.execute(statement)
            except sqlite3.OperationalError: pass
        connection.commit()
    finally: connection.close()


def save_message(message_id, user_id, message, created_at, reply_to_message_id=None):
    connection = get_connection()
    try:
        connection.execute("INSERT OR IGNORE INTO messages (message_id,user_id,message,created_at,reply_to_message_id) VALUES (?,?,?,?,?)", (message_id,user_id,message,created_at,reply_to_message_id)); connection.commit()
    finally: connection.close()


def get_message_owner(message_id):
    connection=get_connection()
    try:
        row=connection.execute("SELECT user_id FROM messages WHERE message_id=?",(message_id,)).fetchone(); return int(row["user_id"]) if row else None
    finally: connection.close()


def get_message(message_id):
    connection=get_connection()
    try:
        row=connection.execute("SELECT m.message_id,m.user_id,m.message,m.created_at,m.edited_at,m.deleted_at,m.reply_to_message_id,u.username,u.display_name,u.avatar FROM messages m JOIN users u ON u.id=m.user_id WHERE m.message_id=?",(message_id,)).fetchone(); return dict(row) if row else None
    finally: connection.close()


def update_message(message_id,user_id,message,edited_at):
    connection=get_connection()
    try:
        cursor=connection.execute("UPDATE messages SET message=?,edited_at=?,deleted_at=NULL WHERE message_id=? AND user_id=?",(message,edited_at,message_id,user_id)); connection.commit(); return cursor.rowcount>0
    finally: connection.close()


def delete_message(message_id,user_id,deleted_at):
    connection=get_connection()
    try:
        cursor=connection.execute("UPDATE messages SET deleted_at=? WHERE message_id=? AND user_id=?",(deleted_at,message_id,user_id)); connection.commit(); return cursor.rowcount>0
    finally: connection.close()


def toggle_reaction(message_id,user_id,reaction,created_at):
    connection=get_connection()
    try:
        existing=connection.execute("SELECT 1 FROM message_reactions WHERE message_id=? AND user_id=? AND reaction=?",(message_id,user_id,reaction)).fetchone()
        if existing:
            connection.execute("DELETE FROM message_reactions WHERE message_id=? AND user_id=? AND reaction=?",(message_id,user_id,reaction)); active=False
        else:
            connection.execute("INSERT INTO message_reactions(message_id,user_id,reaction,created_at) VALUES(?,?,?,?)",(message_id,user_id,reaction,created_at)); active=True
        rows=connection.execute("SELECT reaction,COUNT(*) AS count FROM message_reactions WHERE message_id=? GROUP BY reaction",(message_id,)).fetchall(); connection.commit()
        return active,{row["reaction"]:row["count"] for row in rows}
    finally: connection.close()


def get_reactions(message_id):
    connection=get_connection()
    try:
        rows=connection.execute("SELECT reaction,COUNT(*) AS count FROM message_reactions WHERE message_id=? GROUP BY reaction",(message_id,)).fetchall(); return {row["reaction"]:row["count"] for row in rows}
    finally: connection.close()
