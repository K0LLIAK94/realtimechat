import express from "express";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes.js";
import chatRoutes from "./routes/chat.routes.js";

import cors from "cors";

import messageRoutes from "./routes/message.routes.js";

import { notFound, errorHandler } from "./middlewares/error.middleware.js";

dotenv.config();

const app = express();
app.use(cors()); // <--- разрешаем все домены

app.use(express.json());
app.use(express.static("public"));
app.use("/auth", authRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api", messageRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;