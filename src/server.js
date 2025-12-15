import { createServer } from "http";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import app from "./app.js";
import { db } from "./config/db.js";

const PORT = process.env.PORT || 3000;
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.set("wss", wss);

const checkUserStatus = async (userId) => {
  const now = new Date().toISOString();
  const user = await db.get("SELECT muted_until, banned_until FROM users WHERE id = ?", [userId]);
  return {
    muted: user?.muted_until && user.muted_until > now,
    banned: user?.banned_until && user.banned_until > now
  };
};

// --- Отправка событий всем клиентам (обновления чатов)
export const broadcastChatEvent = (type, payload) => {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type, ...payload }));
    }
  });
};

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.chatId = null;
  ws.userId = null;
  ws.role = null;

  ws.on("pong", () => ws.isAlive = true);

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "AUTH") {
        const payload = jwt.verify(data.token, process.env.JWT_SECRET);
        ws.userId = payload.id;
        ws.role = payload.role;

        const status = await checkUserStatus(ws.userId);
        if (status.banned) {
          ws.send(JSON.stringify({ type: "BANNED", message: "Вы заблокированы" }));
          return ws.close();
        }
        if (status.muted) {
          ws.send(JSON.stringify({ type: "MUTED", message: "Вы в муте" }));
        }
      }

      if (data.type === "JOIN_CHAT") {
        ws.chatId = data.chatId;
      }

      if (data.type === "SEND_MESSAGE") {
        if (!ws.userId || !ws.chatId) return;

        const status = await checkUserStatus(ws.userId);
        if (status.banned) return ws.send(JSON.stringify({ type: "BANNED", message: "Вы заблокированы" }));
        if (status.muted) return ws.send(JSON.stringify({ type: "MUTED", message: "Вы в муте" }));

        // Рассылка сообщения всем в чате
        wss.clients.forEach(client => {
          if (client.readyState === 1 && client.chatId === ws.chatId) {
            client.send(JSON.stringify({ type: "NEW_MESSAGE", payload: data.payload }));
          }
        });
      }

    } catch (e) {
      console.error("WS error", e);
    }
  });
});

// Пинг для поддержания соединений живыми
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
