import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { create, getAll, remove } from "../controllers/chat.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { chatSchema } from "../validators/chat.schema.js";

const router = Router();

router.use(protect);

router.get("/", getAll);
router.post("/", validate(chatSchema), create);
router.delete("/:id", remove);

export default router;
