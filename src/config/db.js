import sqlite3 from "sqlite3";
import { open } from "sqlite";

export const db = await open({
  filename: "./database.db",
  driver: sqlite3.Database
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    muted_until DATETIME,
    banned_until DATETIME,
    ban_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    description TEXT,
    user_id INTEGER,
    is_closed BOOLEAN DEFAULT false,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT,
    chat_id INTEGER,
    user_id INTEGER,
    deleted_at DATETIME,
    deleted_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );
`);

