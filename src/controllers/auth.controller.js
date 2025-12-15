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

  const now = new Date().toISOString();
  if (user.banned_until && user.banned_until > now) {
    return res.status(403).json({
      banned: true,
      ban_until: user.banned_until,
      ban_reason: user.ban_reason,
      message: `Вы заблокированы до ${user.banned_until}`
    });
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role }
  });
};
