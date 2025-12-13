import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { messageSchema } from "../validators/message.schema.js";
import {
  getAll,
  create,
  update,
  remove
} from "../controllers/message.controller.js";

const router = Router();

router.use(protect);

router.get("/chats/:chatId/messages", getAll);
router.post(
  "/chats/:chatId/messages",
  validate(messageSchema),
  create
);
router.put("/messages/:id", validate(messageSchema), update);
router.delete("/messages/:id", remove);

export default router;
