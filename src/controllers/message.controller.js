import {
  createMessage,
  getChatMessages,
  getMessageById,
  updateMessage,
  deleteMessage,
  getUserEmail
} from "../services/message.service.js";

/**
 * GET /api/chats/:chatId/messages
 */
export const getAll = async (req, res) => {
  try {
    const messages = await getChatMessages(req.params.chatId);
    res.json(messages);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ message: "Error fetching messages" });
  }
};

/**
 * POST /api/chats/:chatId/messages
 */
export const create = async (req, res) => {
  try {
    const { text } = req.body;
    const chatId = parseInt(req.params.chatId);
    const userId = req.user.id;

    console.log(`💬 Creating message in chat ${chatId} by user ${userId}`);

    const result = await createMessage(text, chatId, userId);
    
    // ✅ Получаем email из базы
    const user = await getUserEmail(userId);

    const message = {
      id: result.lastID,
      text,
      chat_id: chatId,
      user_id: userId,
      email: user.email,  // ✅ Добавляем email
      created_at: new Date().toISOString()
    };

    console.log(`✅ Message created:`, message);

    // Сначала отправляем ответ клиенту
    res.status(201).json(message);
    console.log(`📤 Response sent to HTTP client`);

    // 🔥 WebSocket broadcast
    const wss = req.app.get("wss");
    if (!wss) {
      console.warn("⚠️ WSS not found in app");
      return;
    }

    console.log(`📡 Starting broadcast. Total WS clients:`, wss.clients.size);

    let sentCount = 0;

    wss.clients.forEach((client) => {
      try {
        // Отправляем только клиентам, которые в этом чате
        if (client.readyState === 1 && client.chatId === chatId) {
          client.send(JSON.stringify({
            type: "NEW_MESSAGE",
            payload: message
          }));
          sentCount++;
        }
      } catch (broadcastErr) {
        console.error("❌ Broadcast error:", broadcastErr);
      }
    });

    console.log(`✅ Broadcast complete: sent to ${sentCount} client(s)`);

  } catch (err) {
    console.error("❌ Error creating message:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error creating message" });
    }
  }
};

/**
 * PUT /api/messages/:id
 */
export const update = async (req, res) => {
  try {
    const message = await getMessageById(req.params.id);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.user_id !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await updateMessage(req.params.id, req.body.text);
    res.json({ message: "Message updated" });
  } catch (err) {
    console.error("Error updating message:", err);
    res.status(500).json({ message: "Error updating message" });
  }
};

/**
 * DELETE /api/messages/:id
 */
export const remove = async (req, res) => {
  try {
    const message = await getMessageById(req.params.id);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.user_id !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await deleteMessage(req.params.id);
    res.json({ message: "Message deleted" });
  } catch (err) {
    console.error("Error deleting message:", err);
    res.status(500).json({ message: "Error deleting message" });
  }
};