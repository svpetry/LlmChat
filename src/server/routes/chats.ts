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
    const messages = getMessagesByChat(req.params.chatId);
    const firstUser = messages.find((m) => m.role === "user");
    if (!firstUser) {
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
                            "Generate a very short title (3-6 words) for a chat that starts with the following user message. Reply with only the title text, no quotes, no punctuation.",
                    },
                    {
                        role: "user",
                        content: firstUser.content.slice(0, 500),
                    },
                ],
                stream: false,
                max_tokens: 30,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            res.status(502).json({ error: `Title generation failed: ${text}` });
            return;
        }

        const data = (await response.json()) as {
            choices: { message: { content: string } }[];
        };
        const title = data.choices?.[0]?.message?.content
            ?.trim()
            .replace(/^["']|["']$/g, "")
            .replace(/\.$/, "");

        if (!title) {
            res.status(500).json({ error: "Empty title generated" });
            return;
        }

        updateChatTitle(req.params.chatId, title);
        res.json({ title });
    } catch (err) {
        res.status(500).json({
            error: `Title generation failed: ${(err as Error).message}`,
        });
    }
});
