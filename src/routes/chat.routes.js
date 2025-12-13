import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { isAdmin } from "../middlewares/admin.middleware.js";
import { create, getAll, remove } from "../controllers/chat.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { chatSchema } from "../validators/chat.schema.js";

const router = Router();

router.use(protect);

// Все видят все чаты
router.get("/", getAll);

// Только админ создаёт чаты
router.post("/", isAdmin, validate(chatSchema), create);

// Только админ удаляет чаты
router.delete("/:id", isAdmin, remove);

export default router;