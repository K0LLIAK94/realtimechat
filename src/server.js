/* --- File: src/server.js --- */
import { createServer } from "http";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import app from "./app.js";
import { db } from "./config/db.js";

const PORT = process.env.PORT || 3000;
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.set("wss", wss);

const getUserStatus = async (userId) => {
  const user = await db.get(
    "SELECT muted_until, banned_until FROM users WHERE id = ?",
    [userId]
  );

  return user;
};

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.chatId = null;
  ws.userId = null;
  ws.role = null;

  ws.on("pong", () => (ws.isAlive = true));

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      // AUTH
      if (data.type === "AUTH") {
        const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
        ws.userId = decoded.id;
        ws.role = decoded.role;

        const status = await getUserStatus(ws.userId);
        const now = Date.now();

        if (status?.banned_until && status.banned_until > now) {
          ws.send(JSON.stringify({
            type: "BANNED",
            payload: {
              userId: ws.userId,
              bannedUntil: new Date(status.banned_until).toISOString(),
              message: "Вы заблокированы"
            }
          }));
          return ws.close();
        }

        if (status?.muted_until && status.muted_until > now) {
          ws.send(JSON.stringify({
            type: "MUTED",
            payload: {
              userId: ws.userId,
              mutedUntil: new Date(status.muted_until).toISOString(),
              message: "Вы в муте"
            }
          }));
        }
      }

      // JOIN CHAT
      if (data.type === "JOIN_CHAT") {
        ws.chatId = data.chatId;
      }

      // SEND MESSAGE
      if (data.type === "SEND_MESSAGE") {
        if (!ws.userId || !ws.chatId) return;

        const status = await getUserStatus(ws.userId);
        const now = Date.now();

        if (status?.banned_until && status.banned_until > now) {
          return ws.send(JSON.stringify({
            type: "BANNED",
            payload: {
              userId: ws.userId,
              bannedUntil: new Date(status.banned_until).toISOString(),
              message: "Вы заблокированы"
            }
          }));
        }

        if (status?.muted_until && status.muted_until > now) {
          return ws.send(JSON.stringify({
            type: "MUTED",
            payload: {
              userId: ws.userId,
              mutedUntil: new Date(status.muted_until).toISOString(),
              message: "Вы в муте"
            }
          }));
        }

        wss.clients.forEach(client => {
          if (
            client.readyState === 1 &&
            client.chatId === ws.chatId
          ) {
            client.send(JSON.stringify({
              type: "NEW_MESSAGE",
              payload: data.payload
            }));
          }
        });
      }

    } catch (e) {
      console.error("WS error", e);
    }
  });
});

// ping
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
