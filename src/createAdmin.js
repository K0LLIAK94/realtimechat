import bcrypt from "bcryptjs";
import { db } from "./config/db.js";

const ADMIN_EMAIL = "424242@gmail.com";
const ADMIN_PASSWORD = "424242";

async function createAdmin() {
  try {
    // Проверяем, существует ли админ
    const existing = await db.get(
      "SELECT * FROM users WHERE email = ?",
      [ADMIN_EMAIL]
    );

    if (existing) {
      console.log("❌ Админ уже существует");
      return;
    }

    // Создаём админа
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await db.run(
      "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
      [ADMIN_EMAIL, hash, "admin"]
    );

    console.log("✅ Админ создан!");
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
  } catch (err) {
    console.error("Ошибка:", err);
  }
}

createAdmin();