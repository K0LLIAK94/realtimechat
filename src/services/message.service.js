import { db } from "../config/db.js";

export const createMessage = (text, chatId, userId) => {
  return db.run("INSERT INTO messages (text, chat_id, user_id) VALUES (?, ?, ?)", [text, chatId, userId]);
};

export const getChatMessages = async (chatId) => {
  const messages = await db.all(`
    SELECT messages.*, users.email
    FROM messages
    JOIN users ON users.id = messages.user_id
    WHERE chat_id = ?
    ORDER BY created_at ASC
  `, [chatId]);

  return messages.map(msg => ({
    ...msg,
    created_at: new Date(msg.created_at).toISOString()
  }));
};


export const getMessageById = (id) => {
  return db.get(`
    SELECT messages.*, users.email
    FROM messages
    JOIN users ON users.id = messages.user_id
    WHERE messages.id = ?
  `, [id]);
};

export const getUserEmail = (userId) => {
  return db.get("SELECT email FROM users WHERE id = ?", [userId]);
};

export const updateMessage = (id, text) => {
  return db.run("UPDATE messages SET text = ? WHERE id = ? AND deleted_at IS NULL", [text, id]);
};

export const softDeleteMessage = (id, deletedBy) => {
  return db.run(`
    UPDATE messages
    SET text = 'Сообщение удалено',
        deleted_at = CURRENT_TIMESTAMP,
        deleted_by = ?
    WHERE id = ?
  `, [deletedBy, id]);
};

export const isUserBannedOrMuted = async (userId) => {
  const now = new Date().toISOString();
  const user = await db.get("SELECT muted_until, banned_until FROM users WHERE id = ?", [userId]);

  return {
    muted: user?.muted_until && user.muted_until > now,
    banned: user?.banned_until && user.banned_until > now
  };
};
