import { db } from "../config/db.js";
import { setChatClosed } from "../services/chat.service.js";


export const muteUser = async (req, res) => {
  let { userId, durationMinutes } = req.body;
  durationMinutes = Number(durationMinutes);
  if (!userId || isNaN(durationMinutes) || durationMinutes <= 0) {
    return res.status(400).json({ message: "Неверные данные: userId и durationMinutes > 0" });
  }

  const mutedUntil = new Date(Date.now() + durationMinutes * 60000).toISOString();

  try {
    await db.run("UPDATE users SET muted_until = ? WHERE id = ?", [mutedUntil, userId]);
    res.json({ message: `Пользователь замучен до ${mutedUntil}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Ошибка при муте пользователя", stack: err.stack });
  }

  const wss = req.app.get("wss");
wss.clients.forEach(client => {
  if (client.readyState === 1 && client.userId === userId) {
    client.send(JSON.stringify({
      type: "MUTED",
      payload: {
        userId,
        durationMinutes,
        mutedUntil,
        message: `Вы в муте на ${durationMinutes} минут`
      }
    }));
  }
});

};

export const banUser = async (req, res) => {
  let { userId, durationMinutes } = req.body;
  durationMinutes = Number(durationMinutes);
  if (!userId || isNaN(durationMinutes) || durationMinutes <= 0) {
    return res.status(400).json({ message: "Неверные данные: userId и durationMinutes > 0" });
  }

  const bannedUntil = new Date(Date.now() + durationMinutes * 60000).toISOString();

  try {
    await db.run("UPDATE users SET banned_until = ? WHERE id = ?", [bannedUntil, userId]);
    res.json({ message: `Пользователь заблокирован до ${bannedUntil}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Ошибка при бане пользователя", stack: err.stack });
  }

  const wss = req.app.get("wss");
wss.clients.forEach(client => {
  if (client.readyState === 1 && client.userId === userId) {
    client.send(JSON.stringify({
      type: "BANNED",
      payload: {
        userId,
        durationMinutes,
        bannedUntil,
        message: `Вы забанены на ${durationMinutes} минут`
      }
    }));
  }
});

};
