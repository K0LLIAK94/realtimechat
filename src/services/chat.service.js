import { db } from "../config/db.js";

export const createChat = (name, description, userId) => {
  return db.run(
    "INSERT INTO chats (name, description, user_id) VALUES (?, ?, ?)",
    [name, description || "", userId]
  );
};

export const getAllChats = () => {
  return db.all(`
    SELECT id, name, description, is_closed, created_at
    FROM chats
    ORDER BY created_at DESC
  `);
};

export const setChatClosed = (chatId, isClosed) => {
  return db.run(
    "UPDATE chats SET is_closed = ? WHERE id = ?",
    [isClosed, chatId]
  );
};

export const getChatById = (id) => {
  return db.get("SELECT * FROM chats WHERE id = ?", [id]);
};

export const deleteChat = async (chatId) => {
  await db.run("DELETE FROM messages WHERE chat_id = ?", [chatId]);
  await db.run("DELETE FROM chats WHERE id = ?", [chatId]);
};