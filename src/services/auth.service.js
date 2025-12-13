import bcrypt from "bcryptjs";
import { db } from "../config/db.js";

export const createUser = async (email, password, role = "user") => {
  const hash = await bcrypt.hash(password, 10);
  return db.run(
    "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
    [email, hash, role]
  );
};

export const findUserByEmail = (email) =>
  db.get("SELECT * FROM users WHERE email = ?", [email]);