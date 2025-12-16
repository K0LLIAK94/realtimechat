// ==============================
// Конфигурация
// ==============================

const API = "http://localhost:3000";
let token = localStorage.getItem("token");
let currentChatId = null;
let currentUser = null; // { id, email, role }
let ws = null; // WebSocket для сообщений текущего чата
let chatsWS = null; // WebSocket для списка чатов
let isMuted = false;
let isBanned = false;
let muteTimer = null;
let muteEndTime = null;
let banTimer = null;
let banEndTime = null;
let banInfo = JSON.parse(localStorage.getItem("banInfo") || "null"); // { until: Date, message }
let chatsWSReconnectTimer = null;

// ==============================
// Вспомогательные функции
// ==============================
function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(email);
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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

  // Показываем только время если сегодня
  if (diff < 86400000 && date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  // Если вчера
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return (
      "Вчера " +
      date.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit"
      })
    );
  }

  // Если в этом году - без года
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  // Полная дата с годом
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
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
    
    // Подключаем WebSocket для списка чатов
    initChatsWS();
    
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
  localStorage.removeItem("muteInfo");
  token = null;
  currentUser = null;
  currentChatId = null;
  
  if (chatsWS) {
    chatsWS.close();
    chatsWS = null;
  }
  
  if (ws) {
    ws.close();
    ws = null;
  }
  
  if (chatsWSReconnectTimer) {
    clearTimeout(chatsWSReconnectTimer);
    chatsWSReconnectTimer = null;
  }
  
  const authDiv = getElement("auth");
  const forumDiv = getElement("forum"); // ИЗМЕНЕНО
  const threadDiv = getElement("thread"); // ИЗМЕНЕНО
  
  if (authDiv) authDiv.classList.remove("hidden");
  if (forumDiv) forumDiv.classList.add("hidden");
  if (threadDiv) threadDiv.classList.add("hidden");
  
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
  const forumDiv = getElement("forum"); // ИЗМЕНЕНО: было "chats"
  const threadDiv = getElement("thread"); // ИЗМЕНЕНО: было "messages"

  if (!authDiv || !forumDiv || !threadDiv) return;

  authDiv.classList.add("hidden");
  forumDiv.classList.remove("hidden");
  threadDiv.classList.add("hidden");
  currentChatId = null;

  // Показываем info пользователя
  const userInfo = getElement("user-info");
  if (userInfo && currentUser) {
    const roleEmoji = currentUser.role === "admin" ? "👑" : "👤";
    userInfo.textContent = `${roleEmoji} ${currentUser.email}`;
  }

  // Показываем создание темы только админам
  const createContainer = getElement("create-topic-container");
  if (createContainer) {
    createContainer.style.display = currentUser?.role === "admin" ? "flex" : "none";
  }

  const list = getElement("topics-list"); // ИЗМЕНЕНО: было "chat-list"
  if (!list) {
    console.error("topics-list element not found!");
    return;
  }

  try {
    const res = await fetch(`${API}/api/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const chats = await res.json();

    console.log("Loaded chats:", chats);
    list.innerHTML = "";

    if (chats.length === 0) {
      list.innerHTML = '<div class="empty-state">📭 Пока нет тем для обсуждения</div>';
      return;
    }

    chats.forEach((chat) => {
      const li = createChatListItem(chat);
      list.appendChild(li);
    });
    
    console.log("Chats rendered:", list.children.length);
  } catch (err) {
    console.error("Error loading chats:", err);
  }
}


async function createChat() {
  const nameInput = getElement("topic-name"); // ИЗМЕНЕНО: было "chat-name"
  if (!nameInput) return;

  const name = nameInput.value.trim();
  if (!name) {
    alert("Введите название темы");
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
      alert(data.message || "Ошибка создания темы");
      return;
    }

    nameInput.value = "";
    await showChats();
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}


function createTopic() {
  createChat();
}

// ==============================
// WebSocket для списка чатов
// ==============================
function initChatsWS() {
  if (!token) {
    console.log("No token, skipping chats WS");
    return;
  }

  // ✅ ДОБАВИТЬ: Закрываем предыдущее соединение если оно уже открыто
  if (chatsWS) {
    if (chatsWS.readyState === WebSocket.OPEN || chatsWS.readyState === WebSocket.CONNECTING) {
      console.log("Chats WS already connected, skipping...");
      return;
    }
    chatsWS.close();
  }

  // Очищаем таймер переподключения если есть
  if (chatsWSReconnectTimer) {
    clearTimeout(chatsWSReconnectTimer);
    chatsWSReconnectTimer = null;
  }

  console.log("🔌 Connecting to Chats WS...");
  chatsWS = new WebSocket("ws://localhost:3000");

  chatsWS.onopen = () => {
    console.log("✅ Chats WS connected");
    
    // Авторизация
    chatsWS.send(JSON.stringify({
      type: "AUTH",
      token: token
    }));
  };

  chatsWS.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("Chats WS message received:", data);
      handleChatEvent(data);
    } catch (err) {
      console.error("Error parsing chats WS message:", err);
    }
  };

  chatsWS.onclose = () => {
    console.log("❌ Chats WS disconnected, reconnecting in 2s...");
    
    // Автопереподключение через 2 секунды
    chatsWSReconnectTimer = setTimeout(() => {
      if (token) {
        initChatsWS();
      }
    }, 2000);
  };

  chatsWS.onerror = (err) => {
    console.error("Chats WS error:", err);
  };
}

function handleChatEvent(data) {
  console.log("handleChatEvent called:", data.type, data);
  
  switch (data.type) {
    case "NEW_CHAT":
      console.log("Processing NEW_CHAT:", data.payload);
      addChatToUI(data.payload);
      break;
      
    case "CHAT_DELETED":
  const deletedChatId = data.chatId || data.payload?.chatId || data.payload?.id;
  console.log("Processing CHAT_DELETED:", deletedChatId);
  removeChatFromUI(deletedChatId);
  break;

      
    case "CHAT_UPDATED":
      console.log("Processing CHAT_UPDATED:", data.payload);
      updateChatInUI(data.payload);
      break;
      
    default:
      // Игнорируем другие события (они для messagesWS)
      break;
  }
}

function addChatToUI(chat) {
  console.log("addChatToUI called with:", chat);
  const list = getElement("topics-list"); // ИЗМЕНЕНО
  if (!list) {
    console.error("topics-list element not found");
    return;
  }

  const existing = list.querySelector(`[data-chat-id="${chat.id}"]`);
  if (existing) {
    console.log("Chat already exists:", chat.id);
    return;
  }

  const placeholder = list.querySelector('.empty-state');
  if (placeholder) {
    console.log("Removing placeholder");
    placeholder.remove();
  }

  console.log("Creating new chat item for:", chat.name);
  const li = createChatListItem(chat);
  
  li.style.opacity = "0";
  li.style.transform = "translateX(-20px)";
  list.appendChild(li);
  
  console.log("Chat item added to DOM");
  
  setTimeout(() => {
    li.style.transition = "all 0.3s ease";
    li.style.opacity = "1";
    li.style.transform = "translateX(0)";
  }, 10);
}

function removeChatFromUI(chatId) {
  const list = getElement("topics-list"); // ИЗМЕНЕНО
  if (!list) return;

  const chatElement = list.querySelector(`[data-chat-id="${chatId}"]`);
  if (!chatElement) return;

  if (currentChatId === chatId) {
    leaveChat();
  }

  chatElement.style.transition = "all 0.3s ease";
  chatElement.style.opacity = "0";
  chatElement.style.transform = "translateX(-20px)";
  
  setTimeout(() => {
    chatElement.remove();
    
    if (list.children.length === 0) {
      list.innerHTML = '<div class="empty-state">📭 Пока нет тем для обсуждения</div>';
    }
  }, 300);
}

function updateChatInUI(chat) {
  console.log("updateChatInUI called with:", chat);
  const list = getElement("topics-list");
  if (!list) {
    console.error("topics-list element not found");
    return;
  }

  const chatElement = list.querySelector(`[data-chat-id="${chat.id}"]`);
  if (!chatElement) {
    console.log("Chat not found in list:", chat.id);
    if (chat.name) {
      addChatToUI(chat);
    }
    return;
  }

  console.log("Updating existing chat:", chat.id);
  
  if (chat.hasOwnProperty('is_closed')) {
    const isClosed = chat.is_closed === true || chat.is_closed === 1;
    
    if (isClosed) {
      chatElement.classList.add("closed-topic");
      
      let titleDiv = chatElement.querySelector(".topic-title");
      let badge = titleDiv?.querySelector(".topic-badge");
      
      if (titleDiv && !badge) {
        badge = document.createElement("span");
        badge.className = "topic-badge closed";
        badge.innerText = "Закрыта";
        titleDiv.appendChild(document.createTextNode(" "));
        titleDiv.appendChild(badge);
      }
      
      const closeBtn = chatElement.querySelector(".topic-action-btn");
      if (closeBtn) {
        closeBtn.innerHTML = "🔓";
        closeBtn.title = "Открыть тему";
      }
    } else {
      chatElement.classList.remove("closed-topic");
      
      let titleDiv = chatElement.querySelector(".topic-title");
      let badge = titleDiv?.querySelector(".topic-badge");
      if (badge) {
        badge.remove();
      }
      
      const closeBtn = chatElement.querySelector(".topic-action-btn");
      if (closeBtn) {
        closeBtn.innerHTML = "🔒";
        closeBtn.title = "Закрыть тему";
      }
    }
    
    chatElement.style.transition = "background 0.5s ease";
    chatElement.style.background = "#e3f2fd";
    setTimeout(() => {
      chatElement.style.background = "";
    }, 500);
  }
  
  if (chat.name) {
    let titleDiv = chatElement.querySelector(".topic-title");
    if (titleDiv) {
      let badge = titleDiv.querySelector(".topic-badge");
      
      for (let node of titleDiv.childNodes) {
        if (node.nodeType === 3) {
          node.textContent = chat.name;
          break;
        }
      }
    }
  }
  
  console.log("Chat updated successfully");
  
  // ИСПРАВЛЕНИЕ: Если мы в этом чате - обновляем статус в заголовке
  if (currentChatId === chat.id && window.currentChatData) {
    console.log("Updating current chat status");
    
    Object.assign(window.currentChatData, chat);
    
    // Обновляем статус темы в заголовке
    const statusEl = getElement("thread-status");
    const isClosed = chat.is_closed === true || chat.is_closed === 1;
    if (statusEl) {
      statusEl.textContent = isClosed ? "🔒 Тема закрыта" : "💬 Активная тема";
    }
    
    // Обновляем кнопку админа
    const actionsEl = getElement("thread-admin-actions");
    if (actionsEl && currentUser?.role === "admin") {
      actionsEl.innerHTML = `
        <button class="topic-action-btn" onclick="toggleChatClosed(${chat.id}, ${!isClosed})" title="${isClosed ? 'Открыть' : 'Закрыть'}">
          ${isClosed ? '🔓' : '🔒'}
        </button>
      `;
    }
    
    const oldClosedNotice = document.querySelector(".closed-notice");
    if (oldClosedNotice) oldClosedNotice.remove();
    
    if (isClosed && currentUser && currentUser.role !== "admin") {
      showClosedChatNotice();
      disableMessageInput();
    } else if (!isMuted && !isBanned) {
      enableMessageInput();
    }
  }
}




function createChatListItem(chat) {
  console.log("createChatListItem called with:", chat);
  
  const li = document.createElement("div"); // ИЗМЕНЕНО: теперь div
  li.className = "topic-item"; // ИЗМЕНЕНО
  li.dataset.chatId = chat.id;
  
  const isClosed = chat.is_closed === true || chat.is_closed === 1;
  
  if (isClosed) {
    li.classList.add("closed-topic");
    console.log("Chat is closed:", chat.id);
  }
  
  const mainDiv = document.createElement("div");
  mainDiv.className = "topic-main";
  mainDiv.onclick = () => openChat(chat);
  
  const titleDiv = document.createElement("div");
  titleDiv.className = "topic-title";
  titleDiv.innerText = chat.name;
  
  if (isClosed) {
    const closedBadge = document.createElement("span");
    closedBadge.className = "topic-badge closed";
    closedBadge.innerText = "Закрыта";
    titleDiv.appendChild(document.createTextNode(" "));
    titleDiv.appendChild(closedBadge);
  }
  
  const metaDiv = document.createElement("div");
  metaDiv.className = "topic-meta";
  metaDiv.innerText = `Создана ${formatTime(chat.created_at)}`;
  
  mainDiv.appendChild(titleDiv);
  mainDiv.appendChild(metaDiv);
  li.appendChild(mainDiv);
  
  // Для админа добавляем кнопки управления
  if (currentUser && currentUser.role === "admin") {
    const actions = document.createElement("div");
    actions.className = "topic-actions";
    
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = isClosed ? "🔓" : "🔒";
    closeBtn.title = isClosed ? "Открыть тему" : "Закрыть тему";
    closeBtn.className = "topic-action-btn";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      const chatElement = e.target.closest('.topic-item');
      const isCurrentlyClosed = chatElement.classList.contains('closed-topic');
      console.log(`Chat ${chat.id} currently closed: ${isCurrentlyClosed}, toggling to: ${!isCurrentlyClosed}`);
      toggleChatClosed(chat.id, !isCurrentlyClosed);
    };
    
    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.title = "Удалить тему";
    deleteBtn.className = "topic-action-btn";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    };
    
    actions.appendChild(closeBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(actions);
  }
  
  console.log("Chat list item created:", li);
  return li;
}


// ==============================
// WebSocket для сообщений чата
// ==============================
function initWebSocket() {
  // Закрываем предыдущее соединение если есть
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }

  ws = new WebSocket("ws://localhost:3000");

  ws.onopen = () => {
    console.log("✅ Messages WS connected");
    
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
    console.log("Messages WS message:", data);
    
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
      const muteMessage = data.payload?.message || "Вы не можете отправлять сообщения (мут)";
      const muteDuration = data.payload?.durationMinutes || 0;
      console.log("Mute duration:", muteDuration);
      handleMute(muteMessage, muteDuration);
      break;
      
    case "BANNED":
      const banMessage = data.payload?.message || "Вы были забанены администратором";
      const banDuration = data.payload?.durationMinutes || 0;
      console.log("Ban duration:", banDuration);
      handleBan(banMessage, banDuration);
      break;

        
      default:
        console.log("Unknown Messages WS event:", data.type);
    }
  };

  ws.onclose = () => {
    console.log("❌ Messages WS disconnected");
  };

  ws.onerror = (err) => {
    console.error("Messages WS error:", err);
  };
}

function handleMute(message, durationMinutes) {
  console.log("handleMute called with duration:", durationMinutes);
  isMuted = true;
  
  // Устанавливаем время окончания мута
  if (durationMinutes && durationMinutes > 0 && durationMinutes < 999999) {
    muteEndTime = new Date(Date.now() + durationMinutes * 60 * 1000);
    console.log("Mute end time:", muteEndTime);
    
    // ✓ СОХРАНЯЕМ В LOCALSTORAGE
    const muteInfo = {
      until: muteEndTime.toISOString(),
      message: message || "Вы не можете отправлять сообщения (мут)",
      temporary: true
    };
    localStorage.setItem("muteInfo", JSON.stringify(muteInfo));
    
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
  alert("⚠️ " + (message || "Вы были забанены администратором"));
  
  // Закрываем WS
  if (ws) {
    ws.close();
    ws = null;
  }
  
  if (chatsWS) {
    chatsWS.close();
    chatsWS = null;
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
  
  const oldNotice = document.querySelector(".mute-notice");
  if (oldNotice) oldNotice.remove();

  const container = getElement("mute-notice-container"); // ИЗМЕНЕНО
  if (!container) return;

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
  
  container.innerHTML = "";
  container.appendChild(notice);
  console.log("Mute notice added to DOM");
}

function showClosedChatNotice() {
  const container = getElement("mute-notice-container");
  if (!container) return;

  const notice = document.createElement("div");
  notice.className = "closed-notice";
  notice.innerHTML = "🔒 <strong>Тема закрыта</strong><br>Вы можете читать сообщения, но не можете отправлять новые";
  
  container.innerHTML = "";
  container.appendChild(notice);
}


function disableMessageInput() {
  const input = getElement("post-input"); // ИЗМЕНЕНО
  const replyForm = document.querySelector(".reply-form");
  
  if (input) input.disabled = true;
  if (replyForm) {
    const btn = replyForm.querySelector("button");
    if (btn) btn.disabled = true;
  }
}

function enableMessageInput() {
  const input = getElement("post-input"); // ИЗМЕНЕНО
  const replyForm = document.querySelector(".reply-form");
  
  if (input) input.disabled = false;
  if (replyForm) {
    const btn = replyForm.querySelector("button");
    if (btn) btn.disabled = false;
  }
  
  if (muteTimer) {
    clearInterval(muteTimer);
    muteTimer = null;
  }
  if (banTimer) {
    clearInterval(banTimer);
    banTimer = null;
  }
  
  localStorage.removeItem("muteInfo");
  
  const notice = document.querySelector(".mute-notice");
  if (notice) notice.remove();
  
  const closedNotice = document.querySelector(".closed-notice");
  if (closedNotice) closedNotice.remove();
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
  
  if (muteTimer) {
    clearInterval(muteTimer);
    muteTimer = null;
  }
  if (banTimer) {
    clearInterval(banTimer);
    banTimer = null;
  }

  const forumDiv = getElement("forum"); // ИЗМЕНЕНО
  const threadDiv = getElement("thread"); // ИЗМЕНЕНО
  const chatTitle = getElement("thread-title"); // ИЗМЕНЕНО

  if (!forumDiv || !threadDiv || !chatTitle) return;

  forumDiv.classList.add("hidden");
  threadDiv.classList.remove("hidden");
  chatTitle.innerText = chat.name;
  
  // Обновляем статус темы
  const statusEl = getElement("thread-status");
  if (statusEl) {
    statusEl.textContent = chat.is_closed ? "🔒 Тема закрыта" : "💬 Активная тема";
  }
  
  // Админские кнопки
  const actionsEl = getElement("thread-admin-actions");
  if (actionsEl && currentUser?.role === "admin") {
    const isClosed = chat.is_closed === true || chat.is_closed === 1;
    actionsEl.innerHTML = `
      <button class="topic-action-btn" onclick="toggleChatClosed(${chat.id}, ${!isClosed})" title="${isClosed ? 'Открыть' : 'Закрыть'}">
        ${isClosed ? '🔓' : '🔒'}
      </button>
    `;
  }
  
  const oldNotice = document.querySelector(".mute-notice");
  if (oldNotice) oldNotice.remove();
  
  const oldClosedNotice = document.querySelector(".closed-chat-notice");
  if (oldClosedNotice) oldClosedNotice.remove();
  
  window.currentChatData = chat;
  
  // Проверяем мут из localStorage
  const muteInfo = JSON.parse(localStorage.getItem("muteInfo") || "null");
  if (muteInfo && muteInfo.until) {
    const muteUntilDate = new Date(muteInfo.until);
    if (Date.now() < muteUntilDate.getTime()) {
      console.log("Restoring mute from localStorage:", muteInfo);
      isMuted = true;
      muteEndTime = muteUntilDate;
      showMuteNotice(muteInfo.message || "Вы не можете отправлять сообщения (мут)", false, muteEndTime);
      startMuteTimer();
      disableMessageInput();
    } else {
      localStorage.removeItem("muteInfo");
    }
  }
  
  if (chat.is_closed && currentUser && currentUser.role !== "admin") {
    showClosedChatNotice();
    disableMessageInput();
  } else if (!isMuted && !isBanned) {
    enableMessageInput();
  }

  await loadMessages(currentChatId);
  initWebSocket();
}


function showClosedChatNotice() {
  const messagesDiv = getElement("messages");
  if (!messagesDiv) return;

  const notice = document.createElement("div");
  notice.className = "closed-chat-notice";
  notice.innerHTML = "🔒 <strong>Тема закрыта</strong><br>Вы можете читать сообщения, но не можете отправлять новые";
  
  const messageHeader = messagesDiv.querySelector(".message-header");
  if (messageHeader) {
    messageHeader.after(notice);
  }
}

async function loadMessages(chatId) {
  try {
    const res = await fetch(`${API}/api/chats/${chatId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const messages = await res.json();
    
    const list = getElement("posts-list"); // ИЗМЕНЕНО: было "message-list"
    if (!list) return;
    
    list.innerHTML = "";
    
    if (messages.length === 0) {
      list.innerHTML = '<div class="empty-state">📝 Пока нет сообщений. Начните обсуждение!</div>';
      return;
    }
    
    messages.forEach(renderMessage);
  } catch (err) {
    console.error(err);
  }
}


function renderMessage(message) {
  const list = getElement("posts-list");
  if (!list) return;

  const existing = list.querySelector(`[data-id="${message.id}"]`);
  if (existing) return;

  const div = document.createElement("div");
  div.className = "post-item";
  div.dataset.id = message.id;

  if (message.deleted_at) {
    div.classList.add("deleted");
  }

  // ГЕНЕРАЦИЯ ЦВЕТА ПО ID ПОЛЬЗОВАТЕЛЯ
  const userColor = getUserColor(message.user_id);

  div.innerHTML = `
    <div class="post-header">
      <span class="post-author${message.user_role === 'admin' ? ' admin' : ''}" style="color: ${message.user_role === 'admin' ? '#f39c12' : userColor}">${escapeHtml(message.email || "Неизвестно")}</span>
      <span class="post-time">${formatTime(message.created_at)}</span>
    </div>
    <div class="post-content">${message.deleted_at ? "Сообщение удалено" : escapeHtml(message.text)}</div>
  `;

  // Добавляем кнопки действий если есть права
  if (!message.deleted_at) {
    const actions = document.createElement("div");
    actions.className = "post-actions"; // ИЗМЕНЕНО

    if (canEditMessage(message)) {
      const editBtn = document.createElement("button");
      editBtn.className = "post-action-btn edit"; // ИЗМЕНЕНО
      editBtn.dataset.id = message.id;
      editBtn.innerHTML = "✏️";
      editBtn.title = "Редактировать";
      actions.appendChild(editBtn);
    }

    if (canDeleteMessage(message)) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "post-action-btn delete"; // ИЗМЕНЕНО
      deleteBtn.dataset.id = message.id;
      deleteBtn.innerHTML = "🗑️";
      deleteBtn.title = "Удалить";
      actions.appendChild(deleteBtn);
    }

    if (currentUser && currentUser.role === "admin" && message.user_id !== currentUser.id) {
      const muteBtn = document.createElement("button");
      muteBtn.className = "post-action-btn mute"; // ИЗМЕНЕНО
      muteBtn.dataset.userId = message.user_id;
      muteBtn.innerHTML = "🔇";
      muteBtn.title = "Мут";
      actions.appendChild(muteBtn);

      const banBtn = document.createElement("button");
      banBtn.className = "post-action-btn ban"; // ИЗМЕНЕНО
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
  
  // Скролл вниз
  const container = getElement("posts-container");
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function getUserColor(userId) {
  const colors = [
    '#e91e63', // Розовый
    '#9c27b0', // Фиолетовый
    '#3f51b5', // Синий
    '#00bcd4', // Голубой
    '#009688', // Бирюзовый
    '#4caf50', // Зеленый
    '#ff9800', // Оранжевый
    '#f44336', // Красный
    '#795548', // Коричневый
    '#607d8b', // Серо-синий
  ];
  
  return colors[userId % colors.length];
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
  const msg = document.querySelector(`.post-item[data-id="${messageId}"]`); // ИЗМЕНЕНО
  if (!msg) return;

  msg.classList.add("deleted");
  
  const textEl = msg.querySelector(".post-content"); // ИЗМЕНЕНО
  if (textEl) {
    textEl.innerText = "Сообщение удалено";
  }

  const actions = msg.querySelector(".post-actions"); // ИЗМЕНЕНО
  if (actions) {
    actions.remove();
  }
}

function updateMessageText(messageId, newText) {
  console.log("Updating message text:", messageId, newText);
  const msg = document.querySelector(`.post-item[data-id="${messageId}"]`); // ИЗМЕНЕНО
  if (!msg) {
    console.log("Message not found:", messageId);
    return;
  }

  const textEl = msg.querySelector(".post-content"); // ИЗМЕНЕНО
  if (textEl) {
    console.log("Old text:", textEl.textContent);
    textEl.textContent = newText;
    console.log("New text:", textEl.textContent);
  }
}

async function sendMessage() {
  if (isMuted || isBanned) {
    alert("Вы не можете отправлять сообщения (мут или бан).");
    return;
  }

  const textInput = getElement("post-input"); // ИЗМЕНЕНО: было "message-text"
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
      
      if (data.message && (data.message.includes("мут") || data.message.includes("бан"))) {
        alert(data.message);
        disableMessageInput();
        return;
      }
      
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
  const msg = document.querySelector(`.post-item[data-id="${messageId}"]`);
  if (!msg) return;

  const textEl = msg.querySelector(".post-content");
  const currentText = textEl ? textEl.textContent : "";

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
      return;
    }

    // Обновляем текст в UI сразу
    if (textEl) {
      textEl.textContent = newText.trim();
    }
  } catch (err) {
    console.error(err);
    alert("Ошибка подключения к серверу");
  }
}

// ==============================
// Управление чатами (для админа)
// ==============================
// ==============================
// Управление чатами (для админа)
// ==============================
async function toggleChatClosed(chatId, isClosed) {
  console.log(`toggleChatClosed called: chatId=${chatId}, isClosed=${isClosed}`);
  
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

    console.log(`Chat ${chatId} status changed to: ${isClosed ? 'closed' : 'open'}`);
    
    // ИСПРАВЛЕНИЕ: Если мы в этом чате - обновляем UI сразу
    if (currentChatId === chatId) {
      const statusEl = getElement("thread-status");
      if (statusEl) {
        statusEl.textContent = isClosed ? "🔒 Тема закрыта" : "💬 Активная тема";
      }
      
      // Обновляем кнопку админа
      const actionsEl = getElement("thread-admin-actions");
      if (actionsEl && currentUser?.role === "admin") {
        actionsEl.innerHTML = `
          <button class="topic-action-btn" onclick="toggleChatClosed(${chatId}, ${!isClosed})" title="${isClosed ? 'Открыть' : 'Закрыть'}">
            ${isClosed ? '🔓' : '🔒'}
          </button>
        `;
      }
      
      // Обновляем currentChatData
      if (window.currentChatData) {
        window.currentChatData.is_closed = isClosed;
      }
      
      // Показываем/убираем уведомление о закрытии
      const oldClosedNotice = document.querySelector(".closed-notice");
      if (oldClosedNotice) oldClosedNotice.remove();
      
      if (isClosed && currentUser && currentUser.role !== "admin") {
        showClosedChatNotice();
        disableMessageInput();
      } else if (!isMuted && !isBanned) {
        enableMessageInput();
      }
    }
    
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

    // Не перезагружаем список - удаление придёт через WebSocket CHAT_DELETED
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
  const threadDiv = getElement("thread"); // ИЗМЕНЕНО
  const forumDiv = getElement("forum"); // ИЗМЕНЕНО
  const messageList = getElement("posts-list"); // ИЗМЕНЕНО

  if (!threadDiv || !forumDiv || !messageList) return;

  threadDiv.style.transition = "opacity 0.3s ease, transform 0.3s ease";
  threadDiv.style.opacity = "0";
  threadDiv.style.transform = "translateX(20px)";
  
  setTimeout(() => {
    threadDiv.classList.add("hidden");
    threadDiv.style.opacity = "";
    threadDiv.style.transform = "";
    
    forumDiv.classList.remove("hidden");
    forumDiv.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    forumDiv.style.opacity = "0";
    forumDiv.style.transform = "translateX(-20px)";
    
    setTimeout(() => {
      forumDiv.style.opacity = "1";
      forumDiv.style.transform = "translateX(0)";
    }, 10);
  }, 300);
  
  currentChatId = null;
  messageList.innerHTML = "";
  
  isMuted = false;
  isBanned = false;
  muteEndTime = null;
  banEndTime = null;
  window.currentChatData = null;

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

// Алиас
function backToForum() {
  leaveChat();
}



// ==============================
// Инициализация при загрузке страницы
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  
  
  
  if (token) {
    try {
      const userData = localStorage.getItem("user");
      if (userData) {
        currentUser = JSON.parse(userData);
        
        // Проверяем бан
        checkBanStatus();
        
        // Проверяем мут из localStorage (НЕ выкидываем на авторизацию!)
        const muteInfo = JSON.parse(localStorage.getItem("muteInfo") || "null");
        if (muteInfo && muteInfo.until) {
          const muteUntilDate = new Date(muteInfo.until);
          if (Date.now() < muteUntilDate.getTime()) {
            console.log("Mute is still active, restoring state");
            isMuted = true;
            muteEndTime = muteUntilDate;
            // Уведомление покажется когда откроем чат
          } else {
            // Мут истёк
            localStorage.removeItem("muteInfo");
          }
        }
        
        initChatsWS();
        showChats();
      } else {
        // Нет данных пользователя - выходим
        logout();
      }
    } catch (e) {
      console.error("Error loading user data:", e);
      logout();
    }
  } else {
    // Нет токена - показываем страницу входа
    const authDiv = getElement("auth");
    if (authDiv) authDiv.classList.remove("hidden");
    checkBanStatus();
  }

  // Делегирование кликов
  document.addEventListener("click", (e) => {
    // Удаление
    if (e.target.closest(".post-action-btn.delete")) {
      const btn = e.target.closest(".post-action-btn.delete");
      const messageId = btn.dataset.id || btn.closest('[data-id]')?.dataset.id;
      if (messageId) {
        deleteMessage(messageId);
      }
    }
    
    // Редактирование
    if (e.target.closest(".post-action-btn.edit")) {
      const btn = e.target.closest(".post-action-btn.edit");
      const messageId = btn.dataset.id || btn.closest('[data-id]')?.dataset.id;
      if (messageId) {
        editMessage(messageId);
      }
    }

    // Мут
    if (e.target.closest(".post-action-btn.mute")) {
      const btn = e.target.closest(".post-action-btn.mute");
      const userId = btn.dataset.userId;
      if (userId) {
        muteUser(userId);
      }
    }

    // Бан
    if (e.target.closest(".post-action-btn.ban")) {
      const btn = e.target.closest(".post-action-btn.ban");
      const userId = btn.dataset.userId;
      if (userId) {
        banUser(userId);
      }
    }
  });

  // Enter для отправки
  // Добавьте в раздел DOMContentLoaded
const postInput = getElement("post-input");
if (postInput) {
    // Enter для отправки
    postInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Счетчик символов (опционально)
    postInput.addEventListener("input", (e) => {
        const replyForm = e.target.closest(".reply-form");
        const length = e.target.value.length;
        
        if (replyForm) {
            if (length > 0) {
                replyForm.classList.add("typing");
                replyForm.setAttribute("data-chars", `${length}/1000`);
            } else {
                replyForm.classList.remove("typing");
            }
            
            // Предупреждение при приближении к лимиту
            if (length > 900) {
                e.target.style.borderColor = "#FFA500";
            } else if (length > 0) {
                e.target.style.borderColor = "var(--success)";
            }
        }
    });
}


  // Enter для создания темы
  const topicName = getElement("topic-name");
  if (topicName) {
    topicName.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        createChat();
      }
    });
  }
});
