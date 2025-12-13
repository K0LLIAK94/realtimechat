import { db } from "../config/db.js";

export const createChat = (name, userId) => {
  return db.run(
    "INSERT INTO chats (name, user_id) VALUES (?, ?)",
    [name, userId]
  );
};

export const getUserChats = (userId) => {
  return db.all(
    "SELECT * FROM chats WHERE user_id = ?",
    [userId]
  );
};

export const deleteChat = (chatId, userId) => {
  return db.run(
    "DELETE FROM chats WHERE id = ? AND user_id = ?",
    [chatId, userId]
  );
};
