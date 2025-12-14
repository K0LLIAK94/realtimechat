import { db } from "../config/db.js";

export const createMessage = (text, chatId, userId) => {
  return db.run(
    "INSERT INTO messages (text, chat_id, user_id) VALUES (?, ?, ?)",
    [text, chatId, userId]
  );
};

export const getChatMessages = (chatId) => {
  return db.all(
    `
    SELECT messages.*, users.email
    FROM messages
    JOIN users ON users.id = messages.user_id
    WHERE chat_id = ?
    ORDER BY created_at ASC
    `,
    [chatId]
  );
};

export const getMessageById = (id) => {
  return db.get(
    `
    SELECT messages.*, users.email
    FROM messages
    JOIN users ON users.id = messages.user_id
    WHERE messages.id = ?
    `,
    [id]
  );
};

export const getUserEmail = (userId) => {
  return db.get(
    "SELECT email FROM users WHERE id = ?",
    [userId]
  );
};

export const updateMessage = (id, text) => {
  return db.run(
    "UPDATE messages SET text = ? WHERE id = ? AND deleted_at IS NULL",
    [text, id]
  );
};

export const softDeleteMessage = (id, deletedBy) => {
  return db.run(
    `
    UPDATE messages
    SET 
      text = 'Сообщение удалено',
      deleted_at = CURRENT_TIMESTAMP,
      deleted_by = ?
    WHERE id = ?
    `,
    [deletedBy, id]
  );
};
