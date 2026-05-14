import { Router } from "express";
import { getSetting } from "../database.js";

export const modelsRouter = Router();

modelsRouter.post("/api/models", async (_req, res) => {
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
