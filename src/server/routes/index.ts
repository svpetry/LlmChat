import { Router } from "express";
import { settingsRouter } from "./settings.js";
import { modelsRouter } from "./models.js";
import { chatsRouter } from "./chats.js";
import { chatCompletionRouter } from "./chat-completion.js";

export const router = Router();
router.use(settingsRouter);
router.use(modelsRouter);
router.use(chatsRouter);
router.use(chatCompletionRouter);
