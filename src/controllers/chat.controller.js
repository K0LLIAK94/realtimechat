import {
  createChat,
  getAllChats,
  deleteChat
} from "../services/chat.service.js";

// Только админ создаёт чаты
export const create = async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  const result = await createChat(name, description, userId);

  const chat = {
    id: result.lastID,
    name,
    description,
    is_closed: false,
    created_at: new Date().toISOString()
  };

  // Отправка события всем клиентам WS (список чатов)
  const wss = req.app.get("wss");
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: "NEW_CHAT", payload: chat }));
    }
  });

  res.status(201).json({ message: "Чат создан", chat });
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

  // WS событие для всех клиентов
  const wss = req.app.get("wss");
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: "CHAT_DELETED",
        chatId,
        message: "Чат был удалён администратором"
      }));
    }
  });

  res.json({ message: "Чат удалён" });
};

export const closeChat = async (req, res) => {
  const { is_closed } = req.body;
  const chatId = Number(req.params.chatId);

  await setChatClosed(chatId, is_closed);

  // WS событие для всех клиентов
  const wss = req.app.get("wss");
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({
        type: "CHAT_UPDATED",
        payload: { id: chatId, is_closed }
      }));
    }
  });

  res.json({
    message: is_closed ? "Чат закрыт" : "Чат открыт",
    chat: { id: chatId, is_closed }
  });
};