// ==============================
// Конфигурация
// ==============================
const API = "http://localhost:3000";
let token = localStorage.getItem("token");
let currentChatId = null;
let ws = null;

const authDiv = document.getElementById("auth");
const chatsDiv = document.getElementById("chats");
const messagesDiv = document.getElementById("messages");

// ==============================
// Проверка email
// ==============================
function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

// ==============================
// AUTH
// ==============================
async function login() {
  const emailVal = document.getElementById("email").value.trim();
  const passwordVal = document.getElementById("password").value.trim();

  if (!emailVal || !passwordVal) {
    document.getElementById("auth-error").innerText = "Введите email и пароль";
    return;
  }

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailVal, password: passwordVal })
    });
    const data = await res.json();

    if (!res.ok) {
      document.getElementById("auth-error").innerText = data.message || "Ошибка входа";
      return;
    }

    token = data.token;
    localStorage.setItem("token", token);
    document.getElementById("auth-error").innerText = "";
    showChats();

  } catch (err) {
    console.error(err);
  }
}

async function register() {
  const emailVal = document.getElementById("email").value.trim();
  const passwordVal = document.getElementById("password").value.trim();

  if (!emailVal || !passwordVal) {
    document.getElementById("auth-error").innerText = "Введите email и пароль";
    return;
  }

  if (!isValidEmail(emailVal)) {
    document.getElementById("auth-error").innerText = "Введите корректный email";
    return;
  }

  if (passwordVal.length < 6) {
    document.getElementById("auth-error").innerText = "Пароль минимум 6 символов";
    return;
  }

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailVal, password: passwordVal })
    });
    const data = await res.json();

    if (!res.ok) {
      document.getElementById("auth-error").innerText = data.message || "Ошибка регистрации";
      return;
    }

    alert("Пользователь создан, теперь войди");
    document.getElementById("auth-error").innerText = "";

  } catch (err) {
    console.error(err);
  }
}

// ==============================
// Чаты
// ==============================
async function showChats() {
  authDiv.classList.add("hidden");
  chatsDiv.classList.remove("hidden");
  messagesDiv.classList.add("hidden");
  currentChatId = null;

  try {
    const res = await fetch(`${API}/api/chats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const chats = await res.json();

    const list = document.getElementById("chat-list");
    list.innerHTML = "";

    chats.forEach(chat => {
      const li = document.createElement("li");
      li.innerText = chat.name;
      li.onclick = () => openChat(chat);
      list.appendChild(li);
    });
  } catch (err) {
    console.error(err);
  }
}

async function createChat() {
  const name = document.getElementById("chat-name").value.trim();
  if (!name) return;

  try {
    const res = await fetch(`${API}/api/chats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Ошибка создания чата");
      return;
    }

    document.getElementById("chat-name").value = "";
    showChats();

  } catch (err) {
    console.error(err);
  }
}

// ==============================
// Сообщения и WebSocket
// ==============================
async function openChat(chat) {
  currentChatId = chat.id;

  chatsDiv.classList.add("hidden");
  messagesDiv.classList.remove("hidden");
  document.getElementById("chat-title").innerText = chat.name;

  try {
    const res = await fetch(`${API}/api/chats/${chat.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const messages = await res.json();
    renderMessages(messages);

    // Подключаем WS
    initWebSocket();

  } catch (err) {
    console.error(err);
  }
}

function initWebSocket() {
  // Закрываем старое соединение, если есть
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  ws = new WebSocket("ws://localhost:3000");

  ws.onopen = () => {
    console.log("✅ WS connected");
    // Отправляем chatId серверу
    ws.send(JSON.stringify({ 
      type: "JOIN_CHAT", 
      chatId: currentChatId 
    }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "NEW_MESSAGE") {
      addMessage(data.payload);
    }
  };

  ws.onclose = () => {
    console.log("❌ WS disconnected");
  };

  ws.onerror = (err) => {
    console.error("WS error:", err);
  };
}

async function sendMessage() {
  const text = document.getElementById("message-text").value.trim();
  if (!text) return;

  try {
    const res = await fetch(`${API}/api/chats/${currentChatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      const data = await res.json();
      console.error("Ошибка отправки:", data.message);
      return;
    }

    document.getElementById("message-text").value = "";
    
    // НЕ добавляем сообщение вручную - оно придёт через WebSocket

  } catch (err) {
    console.error(err);
  }
}

function renderMessages(messages) {
  const list = document.getElementById("message-list");
  list.innerHTML = "";
  messages.forEach(addMessage);
}

function addMessage(msg) {
  const list = document.getElementById("message-list");
  const div = document.createElement("div");
  div.innerText = msg.text;
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

// ==============================
// Выход из чата
// ==============================
function leaveChat() {
  messagesDiv.classList.add("hidden");
  chatsDiv.classList.remove("hidden");
  currentChatId = null;
  document.getElementById("message-list").innerHTML = "";
  
  // Закрываем WebSocket
  if (ws) {
    ws.close();
    ws = null;
  }
}

// ==============================
// Инициализация
// ==============================
if (token) showChats();

// ==============================
// Слушатели
// ==============================
document.getElementById("login-btn").addEventListener("click", login);
document.getElementById("register-btn").addEventListener("click", register);
document.getElementById("chat-create-btn").addEventListener("click", createChat);
document.getElementById("send-message-btn").addEventListener("click", sendMessage);
document.getElementById("leave-chat-btn").addEventListener("click", leaveChat);