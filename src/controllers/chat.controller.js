import {
  createChat,
  getAllChats,
  deleteChat
} from "../services/chat.service.js";

// Только админ создаёт чаты
export const create = async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.id;

  await createChat(name, description, userId);
  res.status(201).json({ message: "Чат создан" });
};

// ВСЕ пользователи видят ВСЕ чаты
export const getAll = async (req, res) => {
  const chats = await getAllChats();
  res.json(chats);
};

// Только админ удаляет чаты
export const remove = async (req, res) => {
  await deleteChat(req.params.id);
  res.json({ message: "Чат удалён" });
};