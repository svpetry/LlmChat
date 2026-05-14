import { Router } from "express";
import {
    getSetting,
    createChat,
    getChat,
    updateChatTitle,
    updateChatTimestamp,
    deleteChat,
    listChats,
    createMessage,
    getMessagesByChat,
} from "../database.js";
import { logger } from "../logger.js";

export const chatsRouter = Router();

// --- Chat management ---

chatsRouter.get("/api/chats", (_req, res) => {
    res.json(
        listChats().map((c) => ({
            id: c.id,
            title: c.title,
            model: c.model,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
        })),
    );
});

chatsRouter.post("/api/chats", (req, res) => {
    const { id, model } = req.body as { id?: string; model?: string };
    if (!id) {
        res.status(400).json({ error: "Missing chat id" });
        return;
    }
    const chat = createChat(id, model ?? "");
    res.json({
        id: chat.id,
        title: chat.title,
        model: chat.model,
        createdAt: chat.created_at,
        updatedAt: chat.updated_at,
    });
});

chatsRouter.get("/api/chats/:chatId", (req, res) => {
    const chat = getChat(req.params.chatId);
    if (!chat) {
        res.status(404).json({ error: "Chat not found" });
        return;
    }
    res.json({
        id: chat.id,
        title: chat.title,
        model: chat.model,
        createdAt: chat.created_at,
        updatedAt: chat.updated_at,
    });
});

chatsRouter.patch("/api/chats/:chatId", (req, res) => {
    const { title } = req.body as { title?: string };
    if (!title) {
        res.status(400).json({ error: "Missing title" });
        return;
    }
    updateChatTitle(req.params.chatId, title);
    res.json({ ok: true });
});

chatsRouter.delete("/api/chats/:chatId", (req, res) => {
    deleteChat(req.params.chatId);
    res.json({ ok: true });
});

// --- Message management ---

chatsRouter.get("/api/chats/:chatId/messages", (req, res) => {
    const chat = getChat(req.params.chatId);
    if (!chat) {
        res.status(404).json({ error: "Chat not found" });
        return;
    }
    const rows = getMessagesByChat(req.params.chatId);
    res.json(
        rows.map((r) => ({
            id: r.id,
            role: r.role,
            content: r.content,
            thinking: r.thinking ? JSON.parse(r.thinking) : undefined,
            toolCalls: r.tool_calls ? JSON.parse(r.tool_calls) : undefined,
            toolResults: r.tool_results
                ? JSON.parse(r.tool_results)
                : undefined,
            stats: r.stats ? JSON.parse(r.stats) : undefined,
        })),
    );
});

chatsRouter.post("/api/chats/:chatId/messages", (req, res) => {
    const chat = getChat(req.params.chatId);
    if (!chat) {
        res.status(404).json({ error: "Chat not found" });
        return;
    }
    const msg = req.body as {
        id?: string;
        role?: string;
        content?: string;
        thinking?: string;
        toolCalls?: unknown[];
        toolResults?: unknown[];
        stats?: unknown;
    };
    if (!msg.id || !msg.role) {
        res.status(400).json({ error: "Missing id or role" });
        return;
    }
    createMessage({
        id: msg.id,
        chat_id: req.params.chatId,
        role: msg.role,
        content: msg.content ?? "",
        thinking: msg.thinking ? JSON.stringify(msg.thinking) : undefined,
        tool_calls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : undefined,
        tool_results: msg.toolResults
            ? JSON.stringify(msg.toolResults)
            : undefined,
        stats: msg.stats ? JSON.stringify(msg.stats) : undefined,
        created_at: Date.now(),
    });
    updateChatTimestamp(req.params.chatId);
    res.json({ ok: true });
});

// --- Title generation ---

chatsRouter.post("/api/chats/:chatId/generate-title", async (req, res) => {
    const chat = getChat(req.params.chatId);
    if (!chat) {
        res.status(404).json({ error: "Chat not found" });
        return;
    }
    const body = (req.body ?? {}) as { firstUserContent?: unknown };
    const firstUserContentFromBody =
        typeof body.firstUserContent === "string"
            ? body.firstUserContent.trim()
            : "";
    const messages = firstUserContentFromBody
        ? []
        : getMessagesByChat(req.params.chatId);
    const firstUserContent =
        firstUserContentFromBody ||
        messages.find((m) => m.role === "user")?.content;
    if (!firstUserContent) {
        res.status(400).json({ error: "No user message found" });
        return;
    }

    const baseUrl = (getSetting("baseUrl") ?? "").replace(/\/+$/, "");
    const apiKey = getSetting("apiKey") ?? "";
    const model = chat.model || getSetting("selectedModel") || "";

    if (!baseUrl || !model) {
        res.status(400).json({ error: "LLM not configured" });
        return;
    }

    try {
        logger.debug("OpenAI API request (title)", {
            url: `${baseUrl}/chat/completions`,
            model,
            chatId: req.params.chatId,
        });

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content:
                            "Generate a very short title (3-6 words) for a chat that starts with the following user message. Do not think step by step. Reply with only the title text, no quotes, no punctuation.",
                    },
                    {
                        role: "user",
                        content: `${firstUserContent.slice(0, 500)}\n\n/no_think`,
                    },
                ],
                stream: false,
                max_tokens: 512,
                temperature: 0.2,
                chat_template_kwargs: {
                    enable_thinking: false,
                },
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            logger.debug("OpenAI API error response (title)", {
                status: response.status,
                body: text,
                chatId: req.params.chatId,
            });
            res.status(502).json({ error: `Title generation failed: ${text}` });
            return;
        }

        const data = (await response.json()) as {
            choices: {
                message?: {
                    content?: string | null;
                    reasoning_content?: string | null;
                    thinking?: string | null;
                };
            }[];
        };
        const title = data.choices?.[0]?.message?.content
            ?.trim()
            .replace(/^["']|["']$/g, "")
            .replace(/\.$/, "");

        if (!title) {
            logger.debug("OpenAI API empty title response", {
                chatId: req.params.chatId,
                choice: data.choices?.[0],
            });
            res.status(500).json({ error: "Empty title generated" });
            return;
        }

        updateChatTitle(req.params.chatId, title);
        logger.debug("OpenAI API response (title)", {
            model,
            chatId: req.params.chatId,
            title,
        });
        res.json({ title });
    } catch (err) {
        logger.debug("OpenAI API request failed (title)", {
            error: (err as Error).message,
            chatId: req.params.chatId,
        });
        res.status(500).json({
            error: `Title generation failed: ${(err as Error).message}`,
        });
    }
});
