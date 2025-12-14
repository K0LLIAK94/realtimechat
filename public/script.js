// ==============================
// Конфигурация
// ==============================
const API = "http://localhost:3000";
let token = localStorage.getItem("token");
let currentChatId = null;
let currentUser = null; // { id, email, role }
let ws = null;

// ==============================
// Вспомогательные функции
// ==============================
function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 86400000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (diff < 172800000 && date.getDate() === now.getDate() - 1) {
    return (
      "Вчера " +
      date.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.error(`Element with id "${id}" not found`);
  }
  return el;
}

// ==============================
// AUTH
// ==============================
async function login() {
  const emailInput = getElement("email");
  const passwordInput = getElement("password");
  const errorDiv = getElement("auth-error");

  if (!emailInput || !passwordInput || !errorDiv) return;

  const emailVal = emailInput.value.trim();
  const passwordVal = passwordInput.value.trim();

  if (!emailVal || !passwordVal) {
    errorDiv.innerText = "Введите email и пароль";
    errorDiv.style.color = "#e74c3c";
    return;
  }

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailVal, password: passwordVal }),
    });
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        errorDiv.innerText = "Неверный email или пароль";
      } else if (data.message === "Validation error") {
        errorDiv.innerText = "Проверьте правильность введённых данных";
      } else {
        errorDiv.innerText = data.message || "Ошибка входа";
      }
      errorDiv.style.color = "#e74c3c";
      return;
    }

    token = data.token;
    currentUser = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role
    };

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(currentUser));
    errorDiv.innerText = "";
    showChats();
  } catch (err) {
    console.error(err);
    errorDiv.innerText = "Ошибка подключения к серверу";
    errorDiv.style.color = "#e74c3c";
  }
}

async function register() {
  const emailInput = getElement("email");
  const passwordInput = getElement("password");
  const errorDiv = getElement("auth-error");

  if (!emailInput || !passwordInput || !errorDiv) return;

  const emailVal = emailInput.value.trim();
  const passwordVal = passwordInput.value.trim();

  if (!emailVal || !passwordVal) {
    errorDiv.innerText = "Введите email и пароль";
    errorDiv.style.color = "#e74c3c";
    return;
  }

  if (!isValidEmail(emailVal)) {
    errorDiv.innerText = "Введите корректный email";
    errorDiv.style.color = "#e74c3c";
    return;
  }

  if (passwordVal.length < 6) {
    errorDiv.innerText = "Пароль минимум 6 символов";
    errorDiv.style.color = "#e74c3c";
    return;
  }

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailVal, password: passwordVal }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorDiv.innerText = data.message || "Ошибка регистрации";
      errorDiv.style.color = "#e74c3c";
      return;
    }

    errorDiv.innerText = "✓ Регистрация успешна! Теперь войдите";
    errorDiv.style.color = "#27ae60";
    passwordInput.value = "";
  } catch (err) {
    console.error(err);
    errorDiv.innerText = "Ошибка подключения к серверу";
    errorDiv.style.color = "#e74c3c";
  }
}

// ==============================
// Чаты
// ==============================
async function showChats() {
  const authDiv = getElement("auth");
  const chatsDiv = getElement("chats");
  const messagesDiv = getElement("messages");

  if (!authDiv || !chatsDiv || !messagesDiv) return;

  authDiv.classList.add("hidden");
  chatsDiv.classList.remove("hidden");
  messagesDiv.classList.add("hidden");
  currentChatId = null;

  try {
    const res = await fetch(`${API}/api/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const chats = await res.json();

    const list = getElement("chat-list");
    if (!list) return;

    list.innerHTML = "";

    if (chats.length === 0) {
      list.innerHTML =
        '<li style="padding: 20px; text-align: center; color: #999;">Нет чатов. Создайте первый!</li>';
      return;
    }

    chats.forEach((chat) => {
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
  const nameInput = getElement("chat-name");
  if (!nameInput) return;

  const name = nameInput.value.trim();
  if (!name) {
    alert("Введите название чата");
    return;
  }

  try {
    const res = await fetch(`${API}/api/chats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Ошибка создания чата");
      return;
    }

    nameInput.value = "";
    await showChats();
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}

// ==============================
// WebSocket
// ==============================
function initWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  ws = new WebSocket("ws://localhost:3000");

  ws.onopen = () => {
    console.log("✅ WS connected");
    
    // Авторизация в WebSocket
    ws.send(JSON.stringify({
      type: "AUTH",
      token: token
    }));

    // Подписка на текущий чат
    if (currentChatId) {
      ws.send(JSON.stringify({
        type: "JOIN_CHAT",
        chatId: currentChatId
      }));
    }
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.type) {
      case "NEW_MESSAGE":
        renderMessage(data.payload);
        break;
        
      case "MESSAGE_DELETED":
        markMessageDeleted(data.payload.id);
        break;
        
      default:
        console.log("Unknown WS event:", data.type);
    }
  };

  ws.onclose = () => {
    console.log("❌ WS disconnected");
  };

  ws.onerror = (err) => {
    console.error("WS error:", err);
  };
}

function joinChat(chatId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "JOIN_CHAT",
      chatId: chatId
    }));
  }
}

// ==============================
// Сообщения
// ==============================
async function openChat(chat) {
  currentChatId = chat.id;

  const chatsDiv = getElement("chats");
  const messagesDiv = getElement("messages");
  const chatTitle = getElement("chat-title");

  if (!chatsDiv || !messagesDiv || !chatTitle) return;

  chatsDiv.classList.add("hidden");
  messagesDiv.classList.remove("hidden");
  chatTitle.innerText = chat.name;

  await loadMessages(currentChatId);
  initWebSocket();
}

async function loadMessages(chatId) {
  try {
    const res = await fetch(`${API}/api/chats/${chatId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const messages = await res.json();
    
    const list = getElement("message-list");
    if (!list) return;
    
    list.innerHTML = "";
    
    if (messages.length === 0) {
      list.innerHTML =
        '<div style="text-align: center; color: #999; padding: 40px;">Нет сообщений. Напишите первое!</div>';
      return;
    }
    
    messages.forEach(renderMessage);
  } catch (err) {
    console.error(err);
  }
}

function renderMessage(message) {
  const list = getElement("message-list");
  if (!list) return;

  const div = document.createElement("div");
  div.className = "message-item";
  div.dataset.id = message.id;

  if (message.deleted_at) {
    div.classList.add("deleted");
  }

  const headerInfo = document.createElement("div");
  headerInfo.className = "message-header-info";

  const author = document.createElement("span");
  author.className = "message-author";
  author.innerText = message.email || "Неизвестно";

  const time = document.createElement("span");
  time.className = "message-time";
  time.innerText = formatTime(message.created_at);

  headerInfo.appendChild(author);
  headerInfo.appendChild(time);

  const textDiv = document.createElement("div");
  textDiv.className = "message-text";
  textDiv.innerText = message.deleted_at ? "Сообщение удалено" : message.text;

  div.appendChild(headerInfo);
  div.appendChild(textDiv);

  // Добавляем кнопку удаления если есть права
  if (canDeleteMessage(message)) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.dataset.id = message.id;
    deleteBtn.innerText = "✖";
    div.appendChild(deleteBtn);
  }

  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

function canDeleteMessage(message) {
  if (!currentUser) return false;
  if (currentUser.role === "admin") return true;
  return message.user_id === currentUser.id && !message.deleted_at;
}

function markMessageDeleted(messageId) {
  const msg = document.querySelector(`.message-item[data-id="${messageId}"]`);
  if (!msg) return;

  msg.classList.add("deleted");
  
  const textEl = msg.querySelector(".message-text");
  if (textEl) {
    textEl.innerText = "Сообщение удалено";
  }

  const deleteBtn = msg.querySelector(".delete-btn");
  if (deleteBtn) {
    deleteBtn.remove();
  }
}

async function sendMessage() {
  const textInput = getElement("message-text");
  if (!textInput) return;

  const text = textInput.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`${API}/api/chats/${currentChatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const data = await res.json();
      console.error("Ошибка отправки:", data.message);
      return;
    }

    textInput.value = "";
  } catch (err) {
    console.error(err);
  }
}

// ==============================
// Удаление сообщения
// ==============================
async function deleteMessage(messageId) {
  try {
    const res = await fetch(`${API}/api/messages/${messageId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const data = await res.json();
      console.error("Ошибка удаления:", data.message);
    }
  } catch (err) {
    console.error(err);
  }
}

// ==============================
// Выход из чата
// ==============================
function leaveChat() {
  const messagesDiv = getElement("messages");
  const chatsDiv = getElement("chats");
  const messageList = getElement("message-list");

  if (!messagesDiv || !chatsDiv || !messageList) return;

  messagesDiv.classList.add("hidden");
  chatsDiv.classList.remove("hidden");
  currentChatId = null;
  messageList.innerHTML = "";

  if (ws) {
    ws.close();
    ws = null;
  }
}

// ==============================
// Инициализация после загрузки DOM
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  // Проверяем токен и загружаем пользователя
  if (token) {
    const userData = localStorage.getItem("user");
    if (userData) {
      currentUser = JSON.parse(userData);
      showChats();
    }
  }

  // Слушатели кнопок
  const loginBtn = getElement("login-btn");
  const registerBtn = getElement("register-btn");
  const chatCreateBtn = getElement("chat-create-btn");
  const sendMessageBtn = getElement("send-message-btn");
  const leaveChatBtn = getElement("leave-chat-btn");

  if (loginBtn) loginBtn.addEventListener("click", login);
  if (registerBtn) registerBtn.addEventListener("click", register);
  if (chatCreateBtn) chatCreateBtn.addEventListener("click", createChat);
  if (sendMessageBtn) sendMessageBtn.addEventListener("click", sendMessage);
  if (leaveChatBtn) leaveChatBtn.addEventListener("click", leaveChat);

  // Скрываем создание чата для не-админов
  if (currentUser && currentUser.role !== "admin") {
    const chatNameInput = getElement("chat-name");
    if (chatNameInput) chatNameInput.style.display = "none";
    if (chatCreateBtn) chatCreateBtn.style.display = "none";
  }

  // Делегирование события для кнопок удаления
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) {
      const messageId = e.target.dataset.id;
      if (messageId) {
        deleteMessage(messageId);
      }
    }
  });

  // Enter для отправки сообщения
  const messageText = getElement("message-text");
  if (messageText) {
    messageText.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendMessage();
      }
    });
  }

  // Enter для создания чата
  const chatName = getElement("chat-name");
  if (chatName) {
    chatName.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        createChat();
      }
    });
  }
});