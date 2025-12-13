// ==============================
// Конфигурация
// ==============================
const API = "http://localhost:3000";
let token = localStorage.getItem("token");
let currentChatId = null;
let currentUserEmail = null;
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

  // Если сегодня - показываем только время
  if (diff < 86400000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Если вчера
  if (diff < 172800000 && date.getDate() === now.getDate() - 1) {
    return (
      "Вчера " +
      date.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }

  // Иначе показываем дату и время
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
      // Улучшенные сообщения об ошибках
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
    currentUserEmail = emailVal;

    localStorage.setItem("token", token);
    localStorage.setItem("userEmail", emailVal);
    if (data.user && data.user.role) {
      localStorage.setItem("userRole", data.user.role);
    }
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

    const role = localStorage.getItem("userRole");

    chats.forEach((chat) => {
      const li = document.createElement("li");
      li.className = "chat-item";
      
      const chatName = document.createElement("span");
      chatName.className = "chat-name";
      chatName.innerText = chat.name;
      chatName.onclick = () => openChat(chat);
      
      li.appendChild(chatName);
      
      // Кнопка удаления только для админов
      if (role === "admin") {
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-chat-btn";
        deleteBtn.innerText = "✕";
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          deleteChat(chat.id);
        };
        li.appendChild(deleteBtn);
      }
      
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

async function deleteChat(chatId) {
  if (!confirm("Вы уверены, что хотите удалить этот чат?")) {
    return;
  }

  try {
    const res = await fetch(`${API}/api/chats/${chatId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Ошибка удаления чата");
      return;
    }

    await showChats();
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}

// ==============================
// Сообщения и WebSocket
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

  try {
    const res = await fetch(`${API}/api/chats/${chat.id}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const messages = await res.json();
    renderMessages(messages);

    initWebSocket();
  } catch (err) {
    console.error(err);
  }
}

function initWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  ws = new WebSocket("ws://localhost:3000");

  ws.onopen = () => {
    console.log("✅ WS connected");
    ws.send(
      JSON.stringify({
        type: "JOIN_CHAT",
        chatId: currentChatId,
      })
    );
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "NEW_MESSAGE") {
      addMessage(data.payload);
    } else if (data.type === "DELETE_MESSAGE") {
      removeMessageFromDOM(data.payload.messageId);
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

async function deleteMessage(messageId) {
  if (!confirm("Удалить это сообщение?")) {
    return;
  }

  try {
    const res = await fetch(`${API}/api/messages/${messageId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Ошибка удаления сообщения");
      return;
    }

    // Сообщение удалится через WebSocket broadcast
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}

function removeMessageFromDOM(messageId) {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    messageEl.remove();
  }
}

function renderMessages(messages) {
  const list = getElement("message-list");
  if (!list) return;

  list.innerHTML = "";

  if (messages.length === 0) {
    list.innerHTML =
      '<div style="text-align: center; color: #999; padding: 40px;">Нет сообщений. Напишите первое!</div>';
    return;
  }

  messages.forEach(addMessage);
}

function addMessage(msg) {
  const list = getElement("message-list");
  if (!list) return;

  const div = document.createElement("div");
  div.className = "message-item";
  div.setAttribute("data-message-id", msg.id);

  const headerInfo = document.createElement("div");
  headerInfo.className = "message-header-info";

  const leftSection = document.createElement("div");
  leftSection.style.display = "flex";
  leftSection.style.alignItems = "center";
  leftSection.style.gap = "8px";

  const author = document.createElement("span");
  author.className = "message-author";
  author.innerText = msg.email || "Неизвестно";

  const time = document.createElement("span");
  time.className = "message-time";
  time.innerText = formatTime(msg.created_at);

  leftSection.appendChild(author);
  leftSection.appendChild(time);

  headerInfo.appendChild(leftSection);

  // Кнопка удаления только для админов
  const role = localStorage.getItem("userRole");
  if (role === "admin") {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-message-btn";
    deleteBtn.innerText = "✕";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteMessage(msg.id);
    };
    headerInfo.appendChild(deleteBtn);
  }

  const textDiv = document.createElement("div");
  textDiv.className = "message-text";
  textDiv.innerText = msg.text;

  div.appendChild(headerInfo);
  div.appendChild(textDiv);

  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
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
  // Проверяем токен
  if (token) {
    currentUserEmail = localStorage.getItem("userEmail");
    showChats();
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

  const role = localStorage.getItem("userRole");
  const chatNameInput = getElement("chat-name");

  // Скрываем создание чатов для не-админов
  if (role !== "admin") {
    if (chatNameInput) chatNameInput.style.display = "none";
    if (chatCreateBtn) chatCreateBtn.style.display = "none";
  }

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