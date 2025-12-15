import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { isAdmin } from "../middlewares/admin.middleware.js";
import { muteUser, banUser } from "../controllers/admin.controller.js";
import { closeChat } from "../controllers/admin.controller.js";
import { remove } from "../controllers/chat.controller.js";

const router = Router();
router.delete("/chats/:id", remove);
router.put("/chats/:chatId/close", closeChat);


router.use(protect, isAdmin);

router.post("/mute", muteUser);
router.post("/ban", banUser);

export default router;
