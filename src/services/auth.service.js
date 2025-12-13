import bcrypt from "bcryptjs";
import { db } from "../config/db.js";

export const createUser = async (email, password) => {
  const hash = await bcrypt.hash(password, 10);
  return db.run(
    "INSERT INTO users (email, password) VALUES (?, ?)",
    [email, hash]
  );
};

export const findUserByEmail = (email) =>
  db.get("SELECT * FROM users WHERE email = ?", [email]);
