import { db } from "../config/db.js";

/**
 * Создать сообщение
 */
export const createMessage = (text, chatId, userId) => {
  return db.run(
    "INSERT INTO messages (text, chat_id, user_id) VALUES (?, ?, ?)",
    [text, chatId, userId]
  );
};

/**
 * Получить сообщения чата с email автора
 */
export const getChatMessages = (chatId) => {
  return db.all(
    `SELECT messages.*, users.email 
     FROM messages
     JOIN users ON users.id = messages.user_id
     WHERE chat_id = ?
     ORDER BY created_at ASC`,
    [chatId]
  );
};

/**
 * Получить сообщение по ID с email автора
 */
export const getMessageById = (id) => {
  return db.get(
    `SELECT messages.*, users.email 
     FROM messages
     JOIN users ON users.id = messages.user_id
     WHERE messages.id = ?`,
    [id]
  );
};

/**
 * Получить email пользователя по ID
 */
export const getUserEmail = (userId) => {
  return db.get(
    "SELECT email FROM users WHERE id = ?",
    [userId]
  );
};

/**
 * Обновить сообщение (только владелец)
 */
export const updateMessage = (id, text) => {
  return db.run(
    "UPDATE messages SET text = ? WHERE id = ?",
    [text, id]
  );
};

/**
 * Удалить сообщение (только владелец)
 */
export const deleteMessage = (id) => {
  return db.run(
    "DELETE FROM messages WHERE id = ?",
    [id]
  );
};