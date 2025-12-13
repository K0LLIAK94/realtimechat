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
 * Получить сообщения чата
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
 * Проверка владельца сообщения
 */
export const getMessageById = (id) => {
  return db.get("SELECT * FROM messages WHERE id = ?", [id]);
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
