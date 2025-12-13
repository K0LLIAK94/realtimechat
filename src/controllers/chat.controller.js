import {
  createChat,
  getUserChats,
  deleteChat
} from "../services/chat.service.js";

export const create = async (req, res) => {
  const { name } = req.body;
  const userId = req.user.id;

  await createChat(name, userId);
  res.status(201).json({ message: "Chat created" });
};

export const getAll = async (req, res) => {
  const chats = await getUserChats(req.user.id);
  res.json(chats);
};

export const remove = async (req, res) => {
  await deleteChat(req.params.id, req.user.id);
  res.json({ message: "Chat deleted" });
};
