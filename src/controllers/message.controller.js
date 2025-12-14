import {
  createMessage,
  getChatMessages,
  getMessageById,
  updateMessage,
  softDeleteMessage,
  getUserEmail
} from "../services/message.service.js";

export const getAll = async (req, res) => {
  const messages = await getChatMessages(req.params.chatId);
  res.json(messages);
};

export const create = async (req, res) => {
  const { text } = req.body;
  const chatId = Number(req.params.chatId);
  const userId = req.user.id;

  const result = await createMessage(text, chatId, userId);
  const user = await getUserEmail(userId);

  const message = {
    id: result.lastID,
    text,
    chat_id: chatId,
    user_id: userId,
    email: user.email,
    created_at: new Date().toISOString(),
    deleted_at: null
  };

  res.status(201).json(message);

  const wss = req.app.get("wss");
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client.chatId === chatId) {
      client.send(JSON.stringify({
        type: "NEW_MESSAGE",
        payload: message
      }));
    }
  });
};

export const update = async (req, res) => {
  const message = await getMessageById(req.params.id);

  if (!message) {
    return res.status(404).json({ message: "Message not found" });
  }

  if (message.user_id !== req.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await updateMessage(req.params.id, req.body.text);
  res.json({ message: "Message updated" });
};

export const remove = async (req, res) => {
  const message = await getMessageById(req.params.id);

  if (!message) {
    return res.status(404).json({ message: "Message not found" });
  }

  const isOwner = message.user_id === req.user.id;
  const isAdmin = req.user.role === "admin";

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await softDeleteMessage(
    message.id,
    isAdmin ? "admin" : "user"
  );

  const wss = req.app.get("wss");
  wss.clients.forEach(client => {
    if (client.readyState === 1 && client.chatId === message.chat_id) {
      client.send(JSON.stringify({
        type: "MESSAGE_DELETED",
        payload: {
          id: message.id,
          chatId: message.chat_id
        }
      }));
    }
  });

  res.json({ message: "Message deleted" });
};
