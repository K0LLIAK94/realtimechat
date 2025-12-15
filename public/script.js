// ==============================
// Конфигурация
// ==============================
const API = "http://localhost:3000";
let token = localStorage.getItem("token");
let currentChatId = null;
let currentUser = null; // { id, email, role }
let ws = null;
let isMuted = false;
let isBanned = false;
let muteTimer = null;
let muteEndTime = null;
let banTimer = null;
let banEndTime = null;
let banInfo = JSON.parse(localStorage.getItem("banInfo") || "null"); // { until: Date, message }

// ==============================
// Вспомогательные функции
// ==============================
function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  
  // Проверяем валидность даты
  if (isNaN(date.getTime())) {
    console.error("Invalid date:", timestamp);
    return "";
  }

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
    
    // Проверяем бан
    checkBanStatus();
    
    showChats();
  } catch (err) {
    console.error(err);
    errorDiv.innerText = "Ошибка подключения к серверу";
    errorDiv.style.color = "#e74c3c";
  }
}

function checkBanStatus() {
  const banData = JSON.parse(localStorage.getItem("banInfo") || "null");
  if (!banData) return;
  
  const authDiv = getElement("auth");
  if (!authDiv) return;
  
  // Проверяем не истёк ли бан
  if (banData.until) {
    const banUntil = new Date(banData.until);
    if (Date.now() > banUntil.getTime()) {
      // Бан истёк
      localStorage.removeItem("banInfo");
      return;
    }
  }
  
  // Показываем уведомление о бане
  let existingBanNotice = authDiv.querySelector(".ban-warning");
  if (existingBanNotice) return; // Уже показано
  
  const banWarning = document.createElement("div");
  banWarning.className = "ban-warning";
  
  if (banData.permanent) {
    banWarning.innerHTML = `<strong>⚠️ Вы заблокированы навсегда</strong><br>${banData.message || "Обратитесь к администратору"}`;
  } else {
    const banUntil = new Date(banData.until);
    const dateStr = banUntil.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    banWarning.innerHTML = `<strong>⚠️ Вы заблокированы до ${dateStr}</strong><br>${banData.message || "Временная блокировка"}`;
  }
  
  const h2 = authDiv.querySelector("h2");
  if (h2) {
    h2.after(banWarning);
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  token = null;
  currentUser = null;
  currentChatId = null;
  
  const authDiv = getElement("auth");
  const chatsDiv = getElement("chats");
  const messagesDiv = getElement("messages");
  
  if (authDiv) authDiv.classList.remove("hidden");
  if (chatsDiv) chatsDiv.classList.add("hidden");
  if (messagesDiv) messagesDiv.classList.add("hidden");
  
  checkBanStatus();
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
      
      const nameSpan = document.createElement("span");
      nameSpan.innerText = chat.name;
      nameSpan.style.flex = "1";
      li.appendChild(nameSpan);
      
      // Для админа добавляем кнопки управления
      if (currentUser && currentUser.role === "admin") {
        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        actions.style.marginLeft = "10px";
        
        // Кнопка закрытия чата
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = chat.is_closed ? "🔓" : "🔒";
        closeBtn.title = chat.is_closed ? "Открыть чат" : "Закрыть чат";
        closeBtn.className = "chat-action-btn";
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          toggleChatClosed(chat.id, !chat.is_closed);
        };
        
        // Кнопка удаления чата
        const deleteBtn = document.createElement("button");
        deleteBtn.innerHTML = "🗑️";
        deleteBtn.title = "Удалить чат";
        deleteBtn.className = "chat-action-btn delete";
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          deleteChat(chat.id);
        };
        
        actions.appendChild(closeBtn);
        actions.appendChild(deleteBtn);
        li.appendChild(actions);
        li.style.display = "flex";
        li.style.alignItems = "center";
      }
      
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
    console.log("WS message received:", data);
    
    switch (data.type) {
      case "NEW_MESSAGE":
        renderMessage(data.payload);
        break;
        
      case "MESSAGE_DELETED":
        markMessageDeleted(data.payload.id);
        break;

      case "MESSAGE_UPDATED":
        console.log("Updating message:", data.payload);
        updateMessageText(data.payload.id, data.payload.text);
        break;
        
      case "MUTED":
        // data.payload должен содержать { durationMinutes }
        const duration = data.payload?.durationMinutes || data.durationMinutes;
        console.log("Mute duration:", duration);
        handleMute(data.message, duration);
        break;
        
      case "BANNED":
        // data.payload должен содержать { durationMinutes }
        const banDuration = data.payload?.durationMinutes || data.durationMinutes;
        console.log("Ban duration:", banDuration);
        handleBan(data.message, banDuration);
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

function handleMute(message, durationMinutes) {
  console.log("handleMute called with duration:", durationMinutes);
  isMuted = true;
  
  // Устанавливаем время окончания мута
  if (durationMinutes && durationMinutes > 0) {
    muteEndTime = new Date(Date.now() + durationMinutes * 60 * 1000);
    console.log("Mute end time:", muteEndTime);
    showMuteNotice(message || "Вы не можете отправлять сообщения (мут)", false, muteEndTime);
    
    // Запускаем таймер обратного отсчёта
    startMuteTimer();
  } else {
    console.log("Permanent mute");
    showMuteNotice(message || "Вы не можете отправлять сообщения (мут)");
  }
  
  disableMessageInput();
}

function startMuteTimer() {
  console.log("Starting mute timer");
  // Очищаем предыдущий таймер если есть
  if (muteTimer) {
    clearInterval(muteTimer);
  }

  muteTimer = setInterval(() => {
    if (!muteEndTime) {
      clearInterval(muteTimer);
      return;
    }

    const now = Date.now();
    const timeLeft = muteEndTime - now;

    if (timeLeft <= 0) {
      // Мут закончился
      console.log("Mute ended");
      clearInterval(muteTimer);
      muteTimer = null;
      muteEndTime = null;
      isMuted = false;
      enableMessageInput();
    } else {
      // Обновляем счётчик
      updateMuteNotice(timeLeft);
    }
  }, 1000);
}

function updateMuteNotice(timeLeft) {
  const notice = document.querySelector(".mute-notice:not(.banned)");
  if (!notice) {
    console.log("Mute notice not found");
    return;
  }

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  
  notice.innerText = `Вы не можете отправлять сообщения. Мут снимется через ${minutes}м ${seconds}с`;
}

function handleBan(message, durationMinutes) {
  console.log("handleBan called with duration:", durationMinutes);
  isBanned = true;
  
  // Сохраняем информацию о бане
  let banUntil = null;
  if (durationMinutes && durationMinutes > 0 && durationMinutes < 999999) {
    banUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    banEndTime = banUntil;
  }
  
  const banData = {
    until: banUntil ? banUntil.toISOString() : null,
    message: message || "Вы забанены",
    permanent: !banUntil || durationMinutes >= 999999
  };
  
  localStorage.setItem("banInfo", JSON.stringify(banData));
  
  // Выкидываем на страницу авторизации
  alert(message || "Вы были забанены администратором");
  
  // Закрываем WS
  if (ws) {
    ws.close();
    ws = null;
  }
  
  // Очищаем токен и переходим на страницу входа
  logout();
}

function startBanTimer() {
  // Очищаем предыдущий таймер если есть
  if (banTimer) {
    clearInterval(banTimer);
  }

  banTimer = setInterval(() => {
    if (!banEndTime) {
      clearInterval(banTimer);
      return;
    }

    const now = Date.now();
    const timeLeft = banEndTime - now;

    if (timeLeft <= 0) {
      // Бан закончился
      clearInterval(banTimer);
      banTimer = null;
      banEndTime = null;
      isBanned = false;
      enableMessageInput();
    } else {
      // Обновляем счётчик
      updateBanNotice(timeLeft);
    }
  }, 1000);
}

function updateBanNotice(timeLeft) {
  const notice = document.querySelector(".mute-notice.banned");
  if (!notice) return;

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  
  notice.innerText = `Вы забанены. Бан снимется через ${minutes}м ${seconds}с`;
}

function showMuteNotice(message, isBan = false, endTime = null) {
  console.log("showMuteNotice:", message, "isBan:", isBan, "endTime:", endTime);
  
  // Удаляем старое уведомление если есть
  const oldNotice = document.querySelector(".mute-notice");
  if (oldNotice) oldNotice.remove();

  const messagesDiv = getElement("messages");
  if (!messagesDiv) return;

  const notice = document.createElement("div");
  notice.className = "mute-notice" + (isBan ? " banned" : "");
  
  if (endTime && endTime < new Date(Date.now() + 999999 * 60 * 1000)) {
    const timeLeft = endTime - Date.now();
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    
    if (isBan) {
      notice.innerText = `Вы забанены. Бан снимется через ${minutes}м ${seconds}с`;
    } else {
      notice.innerText = `Вы не можете отправлять сообщения. Мут снимется через ${minutes}м ${seconds}с`;
    }
  } else {
    notice.innerText = message;
  }
  
  const messageHeader = messagesDiv.querySelector(".message-header");
  if (messageHeader) {
    messageHeader.after(notice);
    console.log("Mute notice added to DOM");
  }
}

function disableMessageInput() {
  const input = getElement("message-text");
  const button = getElement("send-message-btn");
  
  if (input) input.disabled = true;
  if (button) button.disabled = true;
}

function enableMessageInput() {
  const input = getElement("message-text");
  const button = getElement("send-message-btn");
  
  if (input) input.disabled = false;
  if (button) button.disabled = false;
  
  // Очищаем таймеры
  if (muteTimer) {
    clearInterval(muteTimer);
    muteTimer = null;
  }
  if (banTimer) {
    clearInterval(banTimer);
    banTimer = null;
  }
  
  // Удаляем уведомление
  const notice = document.querySelector(".mute-notice");
  if (notice) notice.remove();
}

// ==============================
// Сообщения
// ==============================
async function openChat(chat) {
  currentChatId = chat.id;
  isMuted = false;
  isBanned = false;
  muteEndTime = null;
  banEndTime = null;
  
  // Очищаем таймеры если были
  if (muteTimer) {
    clearInterval(muteTimer);
    muteTimer = null;
  }
  if (banTimer) {
    clearInterval(banTimer);
    banTimer = null;
  }

  const chatsDiv = getElement("chats");
  const messagesDiv = getElement("messages");
  const chatTitle = getElement("chat-title");

  if (!chatsDiv || !messagesDiv || !chatTitle) return;

  chatsDiv.classList.add("hidden");
  messagesDiv.classList.remove("hidden");
  chatTitle.innerText = chat.name;
  
  // Удаляем старые уведомления
  const oldNotice = document.querySelector(".mute-notice");
  if (oldNotice) oldNotice.remove();
  
  enableMessageInput();

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

  // Проверяем, не существует ли уже это сообщение
  const existing = list.querySelector(`[data-id="${message.id}"]`);
  if (existing) return;

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

  // Добавляем кнопки действий если есть права
  if (!message.deleted_at) {
    const actions = document.createElement("div");
    actions.className = "message-actions";

    // Кнопка редактирования (только для своих сообщений)
    if (canEditMessage(message)) {
      const editBtn = document.createElement("button");
      editBtn.className = "edit-btn";
      editBtn.dataset.id = message.id;
      editBtn.innerHTML = "✏️";
      editBtn.title = "Редактировать";
      actions.appendChild(editBtn);
    }

    // Кнопка удаления
    if (canDeleteMessage(message)) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.dataset.id = message.id;
      deleteBtn.innerHTML = "✖";
      deleteBtn.title = "Удалить";
      actions.appendChild(deleteBtn);
    }

    // Кнопки мута/бана для админа
    if (currentUser && currentUser.role === "admin" && message.user_id !== currentUser.id) {
      const muteBtn = document.createElement("button");
      muteBtn.className = "mute-btn";
      muteBtn.dataset.userId = message.user_id;
      muteBtn.innerHTML = "🔇";
      muteBtn.title = "Мут";
      actions.appendChild(muteBtn);

      const banBtn = document.createElement("button");
      banBtn.className = "ban-btn";
      banBtn.dataset.userId = message.user_id;
      banBtn.innerHTML = "🚫";
      banBtn.title = "Бан";
      actions.appendChild(banBtn);
    }

    if (actions.children.length > 0) {
      div.appendChild(actions);
    }
  }

  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

function canDeleteMessage(message) {
  if (!currentUser) return false;
  if (currentUser.role === "admin") return true;
  return message.user_id === currentUser.id && !message.deleted_at;
}

function canEditMessage(message) {
  if (!currentUser) return false;
  // Только свои сообщения можно редактировать
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

  const actions = msg.querySelector(".message-actions");
  if (actions) {
    actions.remove();
  }
}

function updateMessageText(messageId, newText) {
  console.log("Updating message text:", messageId, newText);
  const msg = document.querySelector(`.message-item[data-id="${messageId}"]`);
  if (!msg) {
    console.log("Message not found:", messageId);
    return;
  }

  const textEl = msg.querySelector(".message-text");
  if (textEl) {
    console.log("Old text:", textEl.innerText);
    textEl.innerText = newText;
    console.log("New text:", textEl.innerText);
  }
}

async function sendMessage() {
  if (isMuted || isBanned) {
    alert("Вы не можете отправлять сообщения (мут или бан).");
    return;
  }

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
      
      // Проверяем на мут/бан от сервера
      if (data.message && (data.message.includes("мут") || data.message.includes("бан"))) {
        alert(data.message);
        disableMessageInput();
        return;
      }
      
      // Проверяем закрыт ли чат
      if (data.message && data.message.includes("закрыт")) {
        alert("Чат закрыт для отправки сообщений");
        disableMessageInput();
        return;
      }
      
      console.error("Ошибка отправки:", data.message);
      return;
    }

    textInput.value = "";
  } catch (err) {
    console.error(err);
  }
}

// ==============================
// Редактирование сообщения
// ==============================
async function editMessage(messageId) {
  const msg = document.querySelector(`.message-item[data-id="${messageId}"]`);
  if (!msg) return;

  const textEl = msg.querySelector(".message-text");
  const currentText = textEl ? textEl.innerText : "";

  const newText = prompt("Введите новый текст:", currentText);
  if (!newText || newText.trim() === "" || newText === currentText) return;

  try {
    const res = await fetch(`${API}/api/messages/${messageId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ text: newText.trim() })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Ошибка редактирования");
    }
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}

// ==============================
// Управление чатами (для админа)
// ==============================
async function toggleChatClosed(chatId, isClosed) {
  try {
    const res = await fetch(`${API}/api/admin/chats/${chatId}/close`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ is_closed: isClosed })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Ошибка изменения статуса чата");
      return;
    }

    alert(isClosed ? "Чат закрыт для сообщений" : "Чат открыт");
    await showChats(); // Обновляем список
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}

async function deleteChat(chatId) {
  if (!confirm("Вы уверены, что хотите удалить этот чат? Все сообщения будут удалены безвозвратно!")) {
    return;
  }

  try {
    const res = await fetch(`${API}/api/admin/chats/${chatId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Ошибка удаления чата");
      return;
    }

    alert("Чат удалён");
    await showChats(); // Обновляем список
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}

// ==============================
// Мут и бан пользователей (для админа)
// ==============================
async function muteUser(userId) {
  const minutes = prompt("На сколько минут замутить пользователя?", "5");
  if (!minutes || isNaN(minutes)) return;

  try {
    const res = await fetch(`${API}/api/admin/mute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ 
        userId: parseInt(userId), 
        durationMinutes: parseInt(minutes) 
      })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Ошибка мута");
    } else {
      alert(`Пользователь замучен на ${minutes} минут`);
    }
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}

async function banUser(userId) {
  const minutes = prompt("На сколько минут забанить пользователя? (оставьте пустым для постоянного бана)", "10");
  if (minutes === null) return;
  
  let duration;
  if (minutes === "" || minutes.trim() === "") {
    // Постоянный бан - отправляем большое число
    duration = 999999;
  } else {
    duration = parseInt(minutes);
    if (isNaN(duration) || duration <= 0) {
      alert("Введите корректное число минут больше 0, или оставьте пустым для постоянного бана");
      return;
    }
  }

  const isPermanent = duration >= 999999;
  if (!confirm(`Вы уверены, что хотите забанить этого пользователя${isPermanent ? ' навсегда' : ` на ${duration} минут`}?`)) {
    return;
  }

  try {
    const res = await fetch(`${API}/api/admin/ban`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ 
        userId: parseInt(userId),
        durationMinutes: duration 
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Ban error:", data);
      alert(data.message || "Ошибка бана");
    } else {
      alert(isPermanent ? "Пользователь забанен навсегда" : `Пользователь забанен на ${duration} минут`);
    }
  } catch (err) {
    console.error("Ban exception:", err);
    alert("Ошибка подключения к серверу");
  }
}

// ==============================
// Удаление сообщения
// ==============================
async function deleteMessage(messageId) {
  if (!confirm("Вы уверены, что хотите удалить это сообщение?")) {
    return;
  }

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
  
  isMuted = false;
  isBanned = false;
  muteEndTime = null;
  banEndTime = null;
  
  // Очищаем таймеры
  if (muteTimer) {
    clearInterval(muteTimer);
    muteTimer = null;
  }
  if (banTimer) {
    clearInterval(banTimer);
    banTimer = null;
  }

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
      checkBanStatus();
      showChats();
    }
  } else {
    // Показываем предупреждение о бане если есть
    checkBanStatus();
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

  // Делегирование события для кнопок действий
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) {
      const messageId = e.target.dataset.id;
      if (messageId) {
        deleteMessage(messageId);
      }
    }
    
    if (e.target.classList.contains("edit-btn")) {
      const messageId = e.target.dataset.id;
      if (messageId) {
        editMessage(messageId);
      }
    }

    if (e.target.classList.contains("mute-btn")) {
      const userId = e.target.dataset.userId;
      if (userId) {
        muteUser(userId);
      }
    }

    if (e.target.classList.contains("ban-btn")) {
      const userId = e.target.dataset.userId;
      if (userId) {
        banUser(userId);
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