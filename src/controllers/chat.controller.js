import {
  createChat,
  getAllChats,
  deleteChat,
  setChatClosed
} from "../services/chat.service.js";
import { getChatById } from "../services/chat.service.js";

// Только админ создаёт чаты
export const create = async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  const result = await createChat(name, description, userId);
  const chat = await getChatById(result.lastID);

  const payload = {
    id: chat.id,
    name: chat.name,
    is_closed: chat.is_closed,
    created_at: new Date(chat.created_at).toISOString()
  };

  const wss = req.app.get("wss");
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: "NEW_CHAT",
        payload
      }));
    }
  });

  res.status(201).json({
    message: "Чат создан",
    chat: payload
  });
};

// ВСЕ пользователи видят ВСЕ чаты
export const getAll = async (req, res) => {
  const chats = await getAllChats();
  res.json(chats);
};

// Только админ удаляет чаты
export const remove = async (req, res) => {
  const chatId = Number(req.params.id);
  await deleteChat(chatId);

  const wss = req.app.get("wss");
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: "CHAT_DELETED",
        payload: { chatId }
      }));
    }
  });

  res.json({ message: "Чат удалён" });
};

export const closeChat = async (req, res) => {
  const { is_closed } = req.body;
  const chatId = Number(req.params.chatId);

  await setChatClosed(chatId, is_closed);
  const chat = await getChatById(chatId);

  const payload = {
    id: chat.id,
    name: chat.name,
    is_closed: chat.is_closed,
    created_at: new Date(chat.created_at).toISOString()
  };

  const wss = req.app.get("wss");
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: "CHAT_UPDATED",
        payload
      }));
    }
  });

  res.json({
    message: is_closed ? "Чат закрыт" : "Чат открыт",
    chat: payload
  });
};
