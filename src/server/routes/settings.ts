import { Router } from "express";
import { getSetting, setSetting, getAllSettings } from "../database.js";

export const settingsRouter = Router();

// --- Connection settings ---

settingsRouter.get("/api/settings", (_req, res) => {
    const settings = getAllSettings();
    res.json({
        baseUrl: settings.baseUrl ?? "",
        apiKey: settings.apiKey ?? "",
        selectedModel: settings.selectedModel ?? "",
    });
});

settingsRouter.post("/api/settings", (req, res) => {
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

// --- Search settings ---

settingsRouter.get("/api/search-settings", (_req, res) => {
    const settings = getAllSettings();
    res.json({
        enabled: settings.searchEnabled === "true",
        provider: settings.searchProvider ?? "brave",
        apiKeySet: !!settings.searchApiKey,
        searxngUrlSet: !!settings.searxngUrl,
    });
});

settingsRouter.post("/api/search-settings", (req, res) => {
    const { enabled, provider, searchApiKey, searxngUrl } = req.body as {
        enabled?: boolean;
        provider?: string;
        searchApiKey?: string;
        searxngUrl?: string;
    };
    if (enabled !== undefined) setSetting("searchEnabled", String(enabled));
    if (provider !== undefined) setSetting("searchProvider", provider);
    if (searchApiKey !== undefined) setSetting("searchApiKey", searchApiKey);
    if (searxngUrl !== undefined) setSetting("searxngUrl", searxngUrl);
    res.json({ ok: true });
});

// --- Home directory file access settings ---

settingsRouter.get("/api/file-access-settings", (_req, res) => {
    const settings = getAllSettings();
    res.json({
        enabled: settings.homeFileAccessEnabled === "true",
    });
});

settingsRouter.post("/api/file-access-settings", (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    if (enabled !== undefined) {
        setSetting("homeFileAccessEnabled", String(enabled));
    }
    res.json({ ok: true });
});

// --- Memory settings ---

settingsRouter.get("/api/memory-settings", (_req, res) => {
    const settings = getAllSettings();
    res.json({
        enabled: settings.memoryEnabled === "true",
    });
});

settingsRouter.post("/api/memory-settings", (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    if (enabled !== undefined) {
        setSetting("memoryEnabled", String(enabled));
    }
    res.json({ ok: true });
});

// --- Execute command settings ---

settingsRouter.get("/api/execute-settings", (_req, res) => {
    const settings = getAllSettings();
    res.json({
        enabled: settings.executeEnabled === "true",
    });
});

settingsRouter.post("/api/execute-settings", (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    if (enabled !== undefined) {
        setSetting("executeEnabled", String(enabled));
    }
    res.json({ ok: true });
});
