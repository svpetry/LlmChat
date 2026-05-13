import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    fetchFileAccessSettings,
    fetchMemorySettings,
    fetchSearchSettings,
    saveMemorySettings,
    saveFileAccessSettings,
    saveSearchSettings,
    streamChat,
} from "../api.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, ok = true) {
    return {
        ok,
        json: vi.fn(async () => body),
    };
}

function streamResponse(chunks: string[]) {
    const encodedChunks = chunks.map((chunk) =>
        new TextEncoder().encode(chunk),
    );
    let index = 0;

    return {
        ok: true,
        body: {
            getReader: () => ({
                read: vi.fn(async () => {
                    if (index < encodedChunks.length) {
                        return { done: false, value: encodedChunks[index++] };
                    }
                    return { done: true, value: undefined };
                }),
            }),
        },
    };
}

beforeEach(() => {
    mockFetch.mockReset();
});

describe("settings API helpers", () => {
    it("fetches search settings", async () => {
        mockFetch.mockResolvedValue(
            jsonResponse({
                enabled: true,
                provider: "brave",
                apiKeySet: true,
                searxngUrlSet: false,
            }),
        );

        await expect(fetchSearchSettings()).resolves.toEqual({
            enabled: true,
            provider: "brave",
            apiKeySet: true,
            searxngUrlSet: false,
        });
        expect(mockFetch).toHaveBeenCalledWith("/api/search-settings");
    });

    it("saves search settings", async () => {
        mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

        await expect(
            saveSearchSettings({
                enabled: true,
                provider: "searxng",
                searxngUrl: "https://search.example",
            }),
        ).resolves.toEqual({ ok: true });

        expect(mockFetch).toHaveBeenCalledWith("/api/search-settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                enabled: true,
                provider: "searxng",
                searxngUrl: "https://search.example",
            }),
        });
    });

    it("fetches file access settings", async () => {
        mockFetch.mockResolvedValue(jsonResponse({ enabled: false }));

        await expect(fetchFileAccessSettings()).resolves.toEqual({
            enabled: false,
        });
        expect(mockFetch).toHaveBeenCalledWith("/api/file-access-settings");
    });

    it("saves file access settings", async () => {
        mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

        await expect(
            saveFileAccessSettings({ enabled: true }),
        ).resolves.toEqual({ ok: true });

        expect(mockFetch).toHaveBeenCalledWith("/api/file-access-settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
        });
    });

    it("fetches memory settings", async () => {
        mockFetch.mockResolvedValue(jsonResponse({ enabled: true }));

        await expect(fetchMemorySettings()).resolves.toEqual({
            enabled: true,
        });
        expect(mockFetch).toHaveBeenCalledWith("/api/memory-settings");
    });

    it("saves memory settings", async () => {
        mockFetch.mockResolvedValue(jsonResponse({ ok: true }));

        await expect(saveMemorySettings({ enabled: true })).resolves.toEqual({
            ok: true,
        });

        expect(mockFetch).toHaveBeenCalledWith("/api/memory-settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
        });
    });
});

describe("streamChat", () => {
    it("posts tool-enabled chat requests and parses tool SSE events", async () => {
        mockFetch.mockResolvedValue(
            streamResponse([
                'event: tool_call\ndata: {"id":"call_1","name":"read_home_file","arguments":"{\\"path\\":\\"notes.txt\\"}"}\n\n',
                'event: tool_result\ndata: {"toolCallId":"call_1","content":"Read ~/notes.txt"}\n\n',
                'data: {"choices":[{"delta":{"content":"Done"}}]}\n\n',
                "data: [DONE]\n\n",
            ]),
        );

        const chunks = [];
        for await (const chunk of streamChat(
            [{ role: "user", content: "read notes" }],
            "model-a",
            undefined,
            true,
        )) {
            chunks.push(chunk);
        }

        expect(mockFetch).toHaveBeenCalledWith("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: [{ role: "user", content: "read notes" }],
                model: "model-a",
                toolsEnabled: true,
            }),
            signal: undefined,
        });
        expect(chunks).toEqual([
            {
                toolCall: {
                    id: "call_1",
                    name: "read_home_file",
                    arguments: '{"path":"notes.txt"}',
                },
            },
            {
                toolResult: {
                    toolCallId: "call_1",
                    content: "Read ~/notes.txt",
                },
            },
            { content: "Done" },
        ]);
    });
});
