import { db } from "../config/db.js";

export const createChat = (name, description, userId) => {
  return db.run(
    "INSERT INTO chats (name, description, user_id) VALUES (?, ?, ?)",
    [name, description || "", userId]
  );
};

// Получить ВСЕ чаты (публичные для всех)
export const getAllChats = () => {
  return db.all(
    `SELECT chats.*, users.email as creator_email 
     FROM chats 
     JOIN users ON users.id = chats.user_id
     ORDER BY chats.created_at DESC`
  );
};

// Удалить чат (только админ)
export const deleteChat = (chatId) => {
  return db.run(
    "DELETE FROM chats WHERE id = ?",
    [chatId]
  );
};