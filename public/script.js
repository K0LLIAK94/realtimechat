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
  localStorage.removeItem("muteInfo"); // ✓ ДОБАВИТЬ
  token = null;

  currentUser = null;
  currentChatId = null;
  
  // Закрываем WebSocket соединения
  if (chatsWS) {
    chatsWS.close();
    chatsWS = null;
  }
  
  if (ws) {
    ws.close();
    ws = null;
  }
  
  // Очищаем таймер переподключения
  if (chatsWSReconnectTimer) {
    clearTimeout(chatsWSReconnectTimer);
    chatsWSReconnectTimer = null;
  }
  
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

  // Скрываем/показываем поле создания чата в зависимости от роли
  const chatNameInput = getElement("chat-name");
  const chatCreateBtn = getElement("chat-create-btn");
  
  if (currentUser && currentUser.role === "admin") {
    if (chatNameInput) chatNameInput.style.display = "block";
    if (chatCreateBtn) chatCreateBtn.style.display = "block";
  } else {
    if (chatNameInput) chatNameInput.style.display = "none";
    if (chatCreateBtn) chatCreateBtn.style.display = "none";
  }

  const list = getElement("chat-list");
  if (!list) {
    console.error("chat-list element not found!");
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
      list.innerHTML =
        '<li style="padding: 20px; text-align: center; color: #999;">Нет чатов. Создайте первый!</li>';
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
  const list = getElement("chat-list");
  if (!list) {
    console.error("chat-list element not found");
    return;
  }

  // Проверяем не существует ли уже
  const existing = list.querySelector(`[data-chat-id="${chat.id}"]`);
  if (existing) {
    console.log("Chat already exists:", chat.id);
    return;
  }

  // Удаляем placeholder "Нет чатов" если есть
  const placeholder = list.querySelector('li[style*="text-align: center"]');
  if (placeholder) {
    console.log("Removing placeholder");
    placeholder.remove();
  }

  console.log("Creating new chat item for:", chat.name);
  const li = createChatListItem(chat);
  
  // Добавляем с анимацией
  li.style.opacity = "0";
  li.style.transform = "translateX(-20px)";
  list.appendChild(li);
  
  console.log("Chat item added to DOM");
  
  // Анимация появления
  setTimeout(() => {
    li.style.transition = "all 0.3s ease";
    li.style.opacity = "1";
    li.style.transform = "translateX(0)";
  }, 10);
}

function removeChatFromUI(chatId) {
  const list = getElement("chat-list");
  if (!list) return;

  const chatElement = list.querySelector(`[data-chat-id="${chatId}"]`);
  if (!chatElement) return;

  // Если мы были в этом чате - выходим
  if (currentChatId === chatId) {
    leaveChat();
  }

  // Анимация удаления
  chatElement.style.transition = "all 0.3s ease";
  chatElement.style.opacity = "0";
  chatElement.style.transform = "translateX(-20px)";
  
  setTimeout(() => {
    chatElement.remove();
    
    // Если чатов не осталось - показываем placeholder
    if (list.children.length === 0) {
      list.innerHTML = '<li style="padding: 20px; text-align: center; color: #999;">Нет чатов. Создайте первый!</li>';
    }
  }, 300);
}

function updateChatInUI(chat) {
  console.log("updateChatInUI called with:", chat);
  const list = getElement("chat-list");
  if (!list) {
    console.error("chat-list element not found");
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
  
  // ✅ Обновляем класс closed-chat (проверяем и boolean и число)
  if (chat.hasOwnProperty('is_closed')) {
    const isClosed = chat.is_closed === true || chat.is_closed === 1;
    
    if (isClosed) {
      chatElement.classList.add("closed-chat");
      
      // Обновляем или добавляем бейдж "🔒 Закрыта"
      let nameSpan = chatElement.querySelector("span:first-child");
      let badge = nameSpan?.querySelector(".closed-badge");
      
      if (nameSpan && !badge) {
        badge = document.createElement("span");
        badge.className = "closed-badge";
        badge.innerText = "🔒 Закрыта";
        nameSpan.appendChild(document.createTextNode(" "));
        nameSpan.appendChild(badge);
      }
      
      // Обновляем кнопку админа если она есть
      const closeBtn = chatElement.querySelector(".chat-action-btn");
      if (closeBtn) {
        closeBtn.innerHTML = "🔓";
        closeBtn.title = "Открыть чат";
      }
    } else {
      chatElement.classList.remove("closed-chat");
      
      // Удаляем бейдж "🔒 Закрыта"
      let nameSpan = chatElement.querySelector("span:first-child");
      let badge = nameSpan?.querySelector(".closed-badge");
      if (badge) {
        badge.remove();
        // Удаляем пробел перед badge
        const lastChild = nameSpan.lastChild;
        if (lastChild?.nodeType === 3 && lastChild.textContent.trim() === "") {
          lastChild.remove();
        }
      }
      
      // Обновляем кнопку админа если она есть
      const closeBtn = chatElement.querySelector(".chat-action-btn");
      if (closeBtn) {
        closeBtn.innerHTML = "🔒";
        closeBtn.title = "Закрыть чат";
      }
    }
    
    // Мигание для привлечения внимания
    chatElement.style.transition = "background 0.5s ease";
    chatElement.style.background = "#e3f2fd";
    setTimeout(() => {
      chatElement.style.background = "";
    }, 500);
  }
  
  // Обновляем название если пришло
  if (chat.name) {
    let nameSpan = chatElement.querySelector("span:first-child");
    if (nameSpan) {
      // Сохраняем badge если есть
      let badge = nameSpan.querySelector(".closed-badge");
      let badgeHTML = badge ? badge.outerHTML : "";
      
      // Находим текстовый узел с названием
      for (let node of nameSpan.childNodes) {
        if (node.nodeType === 3) { // текстовый узел
          node.textContent = chat.name;
          break;
        }
      }
    }
  }
  
  console.log("Chat updated successfully");
  
  // Если мы находимся в этом чате - обновляем статус
  if (currentChatId === chat.id && window.currentChatData) {
    console.log("Updating current chat status");
    
    // Обновляем только полученные поля
    Object.assign(window.currentChatData, chat);
    
    // Удаляем старое уведомление о закрытии
    const oldClosedNotice = document.querySelector(".closed-chat-notice");
    if (oldClosedNotice) oldClosedNotice.remove();
    
    // Проверяем закрыт ли чат (учитываем 0/1 и true/false)
    const isClosed = chat.is_closed === true || chat.is_closed === 1;
    
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
  
  const li = document.createElement("li");
  li.dataset.chatId = chat.id;
  
  // Проверяем и число и boolean
  const isClosed = chat.is_closed === true || chat.is_closed === 1;
  
  // Добавляем класс для закрытого чата
  if (isClosed) {
    li.classList.add("closed-chat");
    console.log("Chat is closed:", chat.id);
  }
  
  const nameSpan = document.createElement("span");
  nameSpan.innerText = chat.name;
  nameSpan.style.flex = "1";
  
  // Добавляем индикатор закрытого чата
  if (isClosed) {
    const closedBadge = document.createElement("span");
    closedBadge.className = "closed-badge";
    closedBadge.innerText = "🔒 Закрыта";
    nameSpan.appendChild(document.createTextNode(" "));
    nameSpan.appendChild(closedBadge);
  }
  
  li.appendChild(nameSpan);
  
  // Для админа добавляем кнопки управления
  if (currentUser && currentUser.role === "admin") {
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.marginLeft = "10px";
    actions.style.flexShrink = "0";
    
    // Кнопка закрытия чата
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = isClosed ? "🔓" : "🔒";
    closeBtn.title = isClosed ? "Открыть чат" : "Закрыть чат";
    closeBtn.className = "chat-action-btn";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      
      // ✅ ИСПРАВЛЕНИЕ: Читаем актуальное состояние из DOM
      const chatElement = e.target.closest('li');
      const isCurrentlyClosed = chatElement.classList.contains('closed-chat');
      
      console.log(`Chat ${chat.id} currently closed: ${isCurrentlyClosed}, toggling to: ${!isCurrentlyClosed}`);
      toggleChatClosed(chat.id, !isCurrentlyClosed);
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
  }
  
  li.style.display = "flex";
  li.style.alignItems = "center";
  
  li.onclick = () => openChat(chat);
  
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
  
  // ✅ ДОБАВИТЬ: Очищаем localStorage
  localStorage.removeItem("muteInfo");
  
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
  
  const oldClosedNotice = document.querySelector(".closed-chat-notice");
  if (oldClosedNotice) oldClosedNotice.remove();
  
  // Сохраняем информацию о чате для обработки обновлений
  window.currentChatData = chat;
  
  // ✅ ДОБАВИТЬ: Проверяем сохраненный мут
  const muteInfo = JSON.parse(localStorage.getItem("muteInfo") || "null");
  if (muteInfo && muteInfo.until) {
    const muteUntilDate = new Date(muteInfo.until);
    if (Date.now() < muteUntilDate.getTime()) {
      // Мут еще активен
      console.log("Restoring mute from localStorage:", muteInfo);
      isMuted = true;
      muteEndTime = muteUntilDate;
      showMuteNotice(muteInfo.message || "Вы не можете отправлять сообщения (мут)", false, muteEndTime);
      startMuteTimer();
      disableMessageInput();
    } else {
      // Мут истек
      localStorage.removeItem("muteInfo");
    }
  }
  
  // Если чат закрыт и пользователь не админ - показываем уведомление
  if (chat.is_closed && currentUser && currentUser.role !== "admin") {
    showClosedChatNotice();
    disableMessageInput();
  } else if (!isMuted && !isBanned) {
    // Разблокируем только если нет мута/бана
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

  const authorAndTime = document.createElement("div");
  authorAndTime.className = "author-time-group";

  const author = document.createElement("span");
  author.className = "message-author";
  author.innerText = message.email || "Неизвестно";

  const time = document.createElement("span");
  time.className = "message-time";
  time.innerText = formatTime(message.created_at);

  authorAndTime.appendChild(author);
  authorAndTime.appendChild(time);
  headerInfo.appendChild(authorAndTime);

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
  const messagesDiv = getElement("messages");
  const chatsDiv = getElement("chats");
  const messageList = getElement("message-list");

  if (!messagesDiv || !chatsDiv || !messageList) return;

  // Добавляем анимацию выхода
  messagesDiv.style.transition = "opacity 0.3s ease, transform 0.3s ease";
  messagesDiv.style.opacity = "0";
  messagesDiv.style.transform = "translateX(20px)";
  
  setTimeout(() => {
    messagesDiv.classList.add("hidden");
    messagesDiv.style.opacity = "";
    messagesDiv.style.transform = "";
    
    // Анимация появления списка чатов
    chatsDiv.classList.remove("hidden");
    chatsDiv.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    chatsDiv.style.opacity = "0";
    chatsDiv.style.transform = "translateX(-20px)";
    
    setTimeout(() => {
      chatsDiv.style.opacity = "1";
      chatsDiv.style.transform = "translateX(0)";
    }, 10);
  }, 300);
  
  currentChatId = null;
  messageList.innerHTML = "";
  
  isMuted = false;
  isBanned = false;
  muteEndTime = null;
  banEndTime = null;
  window.currentChatData = null;

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
      
      // ✓ ПРОВЕРЯЕМ СОХРАНЁННЫЙ МУТ
      const muteInfo = JSON.parse(localStorage.getItem("muteInfo") || "null");
      if (muteInfo && muteInfo.until) {
        const muteUntil = new Date(muteInfo.until);
        if (Date.now() < muteUntil.getTime()) {
          // Мут ещё активен
          isMuted = true;
          muteEndTime = muteUntil;
          showMuteNotice(muteInfo.message, false, muteUntil);
          disableMessageInput();
          startMuteTimer();
        } else {
          // Мут истёк
          localStorage.removeItem("muteInfo");
        }
      }
      
      // Подключаем WebSocket для списка чатов
      initChatsWS();

      
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

  // Скрываем создание чата для не-админов при загрузке
  const chatNameInput = getElement("chat-name");
  if (currentUser && currentUser.role !== "admin") {
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