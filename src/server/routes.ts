import { Router } from "express";
import { getSetting, setSetting, getAllSettings } from "./database.js";

export const router = Router();

router.get("/api/settings", (_req, res) => {
    const settings = getAllSettings();
    res.json({
        baseUrl: settings.baseUrl ?? "",
        apiKey: settings.apiKey ?? "",
        selectedModel: settings.selectedModel ?? "",
    });
});

router.post("/api/settings", (req, res) => {
    const { baseUrl, apiKey, selectedModel } = req.body as {
        baseUrl?: string;
        apiKey?: string;
        selectedModel?: string;
    };
    if (baseUrl !== undefined) setSetting("baseUrl", baseUrl);
    if (apiKey !== undefined) setSetting("apiKey", apiKey);
    if (selectedModel !== undefined) setSetting("selectedModel", selectedModel);
    res.json({ ok: true });
});

router.post("/api/models", async (_req, res) => {
    const baseUrl = (getSetting("baseUrl") ?? "").replace(/\/+$/, "");
    const apiKey = getSetting("apiKey") ?? "";

    if (!baseUrl) {
        res.status(400).json({ error: "Base URL not configured" });
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!response.ok) {
            const text = await response.text();
            res.status(response.status).json({ error: `API error: ${text}` });
            return;
        }
        const data = (await response.json()) as { data: { id: string }[] };
        const models = data.data.map((m) => m.id).sort();
        res.json({ models });
    } catch (err) {
        res.status(500).json({
            error: `Failed to fetch models: ${(err as Error).message}`,
        });
    }
});

router.post("/api/chat", async (req, res) => {
    const { messages, model } = req.body as {
        messages: { role: string; content: string }[];
        model: string;
    };
    const baseUrl = (getSetting("baseUrl") ?? "").replace(/\/+$/, "");
    const apiKey = getSetting("apiKey") ?? "";

    if (!baseUrl) {
        res.status(400).json({ error: "Base URL not configured" });
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ model, messages, stream: true }),
        });

        if (!response.ok) {
            const text = await response.text();
            res.status(response.status).json({ error: `API error: ${text}` });
            return;
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = response.body!.getReader();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(Buffer.from(value));
            }
        } finally {
            res.end();
        }
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({
                error: `Chat failed: ${(err as Error).message}`,
            });
        } else {
            res.end();
        }
    }
});
