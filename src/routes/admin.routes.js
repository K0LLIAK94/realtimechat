/* --- File: src/routes/admin.routes.js --- */
import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { isAdmin } from "../middlewares/admin.middleware.js";
import { muteUser, banUser } from "../controllers/admin.controller.js";
// ✅ ИЗМЕНИТЕ ИМПОРТ - используйте closeChat из chat.controller
import { closeChat } from "../controllers/chat.controller.js";
import { remove } from "../controllers/chat.controller.js";

const router = Router();
// ЗАЩИТА ПРИМЕНЯЕТСЯ КО ВСЕМ МАРШРУТАМ НИЖЕ
router.use(protect, isAdmin);

router.delete("/chats/:id", remove);
router.put("/chats/:chatId/close", closeChat);
router.post("/mute", muteUser);
router.post("/ban", banUser);

export default router;
