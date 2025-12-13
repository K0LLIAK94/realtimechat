import { createServer } from "http";
import { WebSocketServer } from "ws";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

// Создаём HTTP сервер
const server = createServer(app);

// Создаём WebSocket сервер
const wss = new WebSocketServer({ server });

// Сохраняем wss в app для доступа из контроллеров
app.set("wss", wss);

// Обработка WebSocket подключений
wss.on("connection", (ws) => {
  console.log("✅ Client connected");

  ws.isAlive = true;
  ws.chatId = null;

  // Heartbeat для проверки соединения
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === "JOIN_CHAT") {
        ws.chatId = data.chatId;
        console.log(`📨 User joined chat ${data.chatId}`);
      }
    } catch (err) {
      console.error("❌ WS message parse error:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ WS client disconnected");
  });

  ws.on("error", (err) => {
    console.error("❌ WS error:", err);
  });
});

// Heartbeat каждые 30 секунд
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("💀 Terminating dead connection");
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on("close", () => {
  clearInterval(interval);
});

// Запускаем сервер
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});