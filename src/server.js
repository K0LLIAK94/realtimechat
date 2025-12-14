import { createServer } from "http";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

const server = createServer(app);
const wss = new WebSocketServer({ server });

app.set("wss", wss);

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.chatId = null;
  ws.userId = null;
  ws.role = null;

  ws.on("pong", () => ws.isAlive = true);

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "AUTH") {
        const payload = jwt.verify(data.token, process.env.JWT_SECRET);
        ws.userId = payload.id;
        ws.role = payload.role;
      }

      if (data.type === "JOIN_CHAT") {
        ws.chatId = data.chatId;
      }
    } catch (e) {
      console.error("WS error", e);
    }
  });
});

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
