import bcrypt from "bcryptjs";
import { createUser, findUserByEmail } from "../services/auth.service.js";
import { signToken } from "../utils/jwt.js";

export const register = async (req, res) => {
  const { email, password } = req.body;
  await createUser(email, password);
  res.status(201).json({ message: "Пользователь создан" });
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await findUserByEmail(email);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Неверные данные" });
  }

  const token = signToken({ 
    id: user.id, 
    email: user.email,
    role: user.role  // ✅ Добавляем роль в токен
  });
  
  res.json({ 
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role  // ✅ Отправляем роль клиенту
    }
  });
};