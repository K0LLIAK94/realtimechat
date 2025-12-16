import { db } from "../config/db.js";

export const createChat = (name, description, userId) => {
  const now = Date.now();
  return db.run(
    "INSERT INTO chats (name, description, user_id, created_at) VALUES (?, ?, ?, ?)",
    [name, description || "", userId, now]
  );
};

export const getAllChats = async () => {
  const chats = await db.all(`
    SELECT id, name, description, is_closed, created_at
    FROM chats
    ORDER BY created_at DESC
  `);

  return chats.map(chat => ({
    ...chat,
    created_at: new Date(chat.created_at).toISOString()
  }));
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
