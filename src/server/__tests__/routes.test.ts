import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockGetSetting = vi.fn();
const mockSetSetting = vi.fn();
const mockGetAllSettings = vi.fn();
const mockSearchBrave = vi.fn();
const mockSearchSearxng = vi.fn();
const mockCreateChat = vi.fn();
const mockGetChat = vi.fn();
const mockUpdateChatTitle = vi.fn();
const mockUpdateChatTimestamp = vi.fn();
const mockDeleteChat = vi.fn();
const mockListChats = vi.fn();
const mockCreateMessage = vi.fn();
const mockGetMessagesByChat = vi.fn();

vi.mock("../database.js", () => ({
    getSetting: mockGetSetting,
    setSetting: mockSetSetting,
    getAllSettings: mockGetAllSettings,
    createChat: mockCreateChat,
    getChat: mockGetChat,
    updateChatTitle: mockUpdateChatTitle,
    updateChatTimestamp: mockUpdateChatTimestamp,
    deleteChat: mockDeleteChat,
    listChats: mockListChats,
    createMessage: mockCreateMessage,
    getMessagesByChat: mockGetMessagesByChat,
}));

vi.mock("../search.js", () => ({
    searchBrave: mockSearchBrave,
    searchSearxng: mockSearchSearxng,
    webSearchTool: {
        type: "function",
        function: {
            name: "web_search",
            description: "Search the web",
            parameters: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
            },
        },
    },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { router } = await import("../routes.js");

function createApp() {
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
}

function createStreamResponse(payloads: string[]) {
    const chunks = payloads.map((payload) => new TextEncoder().encode(payload));
    let readCount = 0;

    return {
        ok: true,
        body: {
            getReader: () => ({
                read: vi.fn(async () => {
                    if (readCount < chunks.length) {
                        return { done: false, value: chunks[readCount++] };
                    }
                    return { done: true, value: undefined };
                }),
            }),
        },
    };
}

function sseData(payload: unknown) {
    return `data: ${JSON.stringify(payload)}\n\n`;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("GET /api/settings", () => {
    it("returns stored settings", async () => {
        mockGetAllSettings.mockReturnValue({
            baseUrl: "http://example.com/v1",
            apiKey: "key123",
        });

        const res = await request(createApp()).get("/api/settings");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            baseUrl: "http://example.com/v1",
            apiKey: "key123",
            selectedModel: "",
        });
    });

    it("returns empty strings when no settings exist", async () => {
        mockGetAllSettings.mockReturnValue({});

        const res = await request(createApp()).get("/api/settings");

        expect(res.body).toEqual({ baseUrl: "", apiKey: "", selectedModel: "" });
    });
});

describe("POST /api/settings", () => {
    it("saves both baseUrl and apiKey", async () => {
        const res = await request(createApp())
            .post("/api/settings")
            .send({ baseUrl: "http://example.com/v1", apiKey: "mykey" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
        expect(mockSetSetting).toHaveBeenCalledWith(
            "baseUrl",
            "http://example.com/v1",
        );
        expect(mockSetSetting).toHaveBeenCalledWith("apiKey", "mykey");
    });

    it("saves only provided fields", async () => {
        const res = await request(createApp())
            .post("/api/settings")
            .send({ baseUrl: "http://example.com/v1" });

        expect(res.body).toEqual({ ok: true });
        expect(mockSetSetting).toHaveBeenCalledOnce();
        expect(mockSetSetting).toHaveBeenCalledWith(
            "baseUrl",
            "http://example.com/v1",
        );
    });
});

describe("POST /api/models", () => {
    it("returns 400 when baseUrl is not configured", async () => {
        mockGetSetting.mockReturnValue(undefined);

        const res = await request(createApp()).post("/api/models");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Base URL not configured");
    });

    it("returns sorted model list on success", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "test-key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [{ id: "gpt-4" }, { id: "gpt-3.5-turbo" }],
            }),
        });

        const res = await request(createApp()).post("/api/models");

        expect(res.status).toBe(200);
        expect(res.body.models).toEqual(["gpt-3.5-turbo", "gpt-4"]);
        expect(mockFetch).toHaveBeenCalledWith(
            "http://llm.example.com/v1/models",
            {
                headers: { Authorization: "Bearer test-key" },
            },
        );
    });

    it("strips trailing slash from baseUrl", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1/";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ data: [] }),
        });

        await request(createApp()).post("/api/models");

        expect(mockFetch).toHaveBeenCalledWith(
            "http://llm.example.com/v1/models",
            expect.any(Object),
        );
    });

    it("forwards upstream API error", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: false,
            status: 401,
            text: async () => "Unauthorized",
        });

        const res = await request(createApp()).post("/api/models");

        expect(res.status).toBe(401);
        expect(res.body.error).toContain("Unauthorized");
    });

    it("returns 500 on network failure", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockRejectedValue(new Error("Connection refused"));

        const res = await request(createApp()).post("/api/models");

        expect(res.status).toBe(500);
        expect(res.body.error).toContain("Connection refused");
    });
});

describe("POST /api/chat", () => {
    it("returns 400 when baseUrl is not configured", async () => {
        mockGetSetting.mockReturnValue(undefined);

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "hi" }],
                model: "gpt-4",
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("Base URL not configured");
    });

    it("streams SSE chunks to the client", async () => {
        const chunks = [
            new TextEncoder().encode(
                'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
            ),
            new TextEncoder().encode(
                'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
            ),
            new TextEncoder().encode("data: [DONE]\n\n"),
        ];

        let readCount = 0;
        const fakeReader = {
            read: vi.fn(async () => {
                if (readCount < chunks.length) {
                    return { done: false, value: chunks[readCount++] };
                }
                return { done: true, value: undefined };
            }),
        };

        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: true,
            body: { getReader: () => fakeReader },
        });

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "hi" }],
                model: "gpt-4",
            });

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toContain("text/event-stream");
        expect(res.text).toContain("Hello");
        expect(res.text).toContain("world");
        expect(mockFetch).toHaveBeenCalledWith(
            "http://llm.example.com/v1/chat/completions",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer key",
                }),
            }),
        );
    });

    it("strips channel markup from tool follow-up content", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "searchEnabled") return "true";
            if (key === "searchProvider") return "brave";
            if (key === "searchApiKey") return "search-key";
            return undefined;
        });
        mockSearchBrave.mockResolvedValue([
            {
                title: "Search result",
                url: "https://example.com",
                snippet: "Useful context",
            },
        ]);

        mockFetch
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [
                            {
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            id: "call_1",
                                            type: "function",
                                            function: {
                                                name: "web_search",
                                                arguments:
                                                    '{"query":"test search"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [
                            { delta: {}, finish_reason: "tool_calls" },
                        ],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [
                            { delta: { content: "<|channel>" } },
                        ],
                    }),
                    sseData({
                        choices: [
                            { delta: { content: "thought " } },
                        ],
                    }),
                    sseData({
                        choices: [
                            { delta: { content: "<channel|>Here" } },
                        ],
                    }),
                    sseData({
                        choices: [
                            { delta: { content: " is the answer." } },
                        ],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "search for this" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toMatch(/Here[\s\S]* is the answer\./);
        expect(res.text).not.toContain("<|channel");
        expect(res.text).not.toContain("<channel|>");
    });

    it("forwards upstream API error", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: false,
            status: 429,
            text: async () => "Rate limited",
        });

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "hi" }],
                model: "gpt-4",
            });

        expect(res.status).toBe(429);
        expect(res.body.error).toContain("Rate limited");
    });

    it("returns 500 on network failure", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "hi" }],
                model: "gpt-4",
            });

        expect(res.status).toBe(500);
        expect(res.body.error).toContain("ECONNREFUSED");
    });
});

describe("GET /api/chats", () => {
    it("returns chat list with camelCase fields", async () => {
        mockListChats.mockReturnValue([
            { id: "c1", title: "Chat 1", model: "gpt-4", created_at: 1000, updated_at: 2000 },
        ]);

        const res = await request(createApp()).get("/api/chats");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            { id: "c1", title: "Chat 1", model: "gpt-4", createdAt: 1000, updatedAt: 2000 },
        ]);
    });

    it("returns empty array when no chats exist", async () => {
        mockListChats.mockReturnValue([]);

        const res = await request(createApp()).get("/api/chats");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe("POST /api/chats", () => {
    it("creates a chat", async () => {
        mockCreateChat.mockReturnValue({
            id: "new-1", title: "New Chat", model: "gpt-4", created_at: 1000, updated_at: 1000,
        });

        const res = await request(createApp())
            .post("/api/chats")
            .send({ id: "new-1", model: "gpt-4" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            id: "new-1", title: "New Chat", model: "gpt-4", createdAt: 1000, updatedAt: 1000,
        });
        expect(mockCreateChat).toHaveBeenCalledWith("new-1", "gpt-4");
    });

    it("defaults model to empty string when not provided", async () => {
        mockCreateChat.mockReturnValue({
            id: "new-2", title: "New Chat", model: "", created_at: 1000, updated_at: 1000,
        });

        const res = await request(createApp())
            .post("/api/chats")
            .send({ id: "new-2" });

        expect(res.status).toBe(200);
        expect(mockCreateChat).toHaveBeenCalledWith("new-2", "");
    });

    it("returns 400 when id is missing", async () => {
        const res = await request(createApp())
            .post("/api/chats")
            .send({ model: "gpt-4" });

        expect(res.status).toBe(400);
    });
});

describe("GET /api/chats/:chatId", () => {
    it("returns a single chat", async () => {
        mockGetChat.mockReturnValue({
            id: "c1", title: "Test Chat", model: "gpt-4", created_at: 1000, updated_at: 2000,
        });

        const res = await request(createApp()).get("/api/chats/c1");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            id: "c1", title: "Test Chat", model: "gpt-4", createdAt: 1000, updatedAt: 2000,
        });
    });

    it("returns 404 for non-existent chat", async () => {
        mockGetChat.mockReturnValue(undefined);

        const res = await request(createApp()).get("/api/chats/missing");

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Chat not found");
    });
});

describe("PATCH /api/chats/:chatId", () => {
    it("updates chat title", async () => {
        const res = await request(createApp())
            .patch("/api/chats/c1")
            .send({ title: "New Title" });

        expect(res.status).toBe(200);
        expect(mockUpdateChatTitle).toHaveBeenCalledWith("c1", "New Title");
    });

    it("returns 400 when title is missing", async () => {
        const res = await request(createApp())
            .patch("/api/chats/c1")
            .send({});

        expect(res.status).toBe(400);
    });
});

describe("DELETE /api/chats/:chatId", () => {
    it("deletes a chat", async () => {
        const res = await request(createApp()).delete("/api/chats/c1");

        expect(res.status).toBe(200);
        expect(mockDeleteChat).toHaveBeenCalledWith("c1");
    });
});

describe("GET /api/chats/:chatId/messages", () => {
    it("returns 404 for non-existent chat", async () => {
        mockGetChat.mockReturnValue(undefined);

        const res = await request(createApp()).get("/api/chats/missing/messages");

        expect(res.status).toBe(404);
    });

    it("returns deserialized messages", async () => {
        mockGetChat.mockReturnValue({ id: "c1" });
        mockGetMessagesByChat.mockReturnValue([
            {
                id: "m1", chat_id: "c1", role: "user", content: "hi",
                thinking: null, tool_calls: null, tool_results: null, stats: null,
                created_at: 1000,
            },
            {
                id: "m2", chat_id: "c1", role: "assistant", content: "hello",
                thinking: null,
                tool_calls: JSON.stringify([{ id: "tc1", name: "web_search", arguments: "{}" }]),
                tool_results: JSON.stringify([{ toolCallId: "tc1", content: "result" }]),
                stats: JSON.stringify({ ppTime: 50, tokensPerSec: 100, tokenCount: 5 }),
                created_at: 2000,
            },
        ]);

        const res = await request(createApp()).get("/api/chats/c1/messages");

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].role).toBe("user");
        expect(res.body[0].content).toBe("hi");
        expect(res.body[1].toolCalls).toEqual([{ id: "tc1", name: "web_search", arguments: "{}" }]);
        expect(res.body[1].stats).toEqual({ ppTime: 50, tokensPerSec: 100, tokenCount: 5 });
    });

    it("deserializes thinking field", async () => {
        mockGetChat.mockReturnValue({ id: "c1" });
        mockGetMessagesByChat.mockReturnValue([
            {
                id: "m1", chat_id: "c1", role: "assistant", content: "answer",
                thinking: JSON.stringify("Let me think about this"),
                tool_calls: null, tool_results: null, stats: null,
                created_at: 1000,
            },
        ]);

        const res = await request(createApp()).get("/api/chats/c1/messages");

        expect(res.status).toBe(200);
        expect(res.body[0].thinking).toBe("Let me think about this");
        expect(res.body[0].toolCalls).toBeUndefined();
        expect(res.body[0].stats).toBeUndefined();
    });

    it("returns empty array for chat with no messages", async () => {
        mockGetChat.mockReturnValue({ id: "c1" });
        mockGetMessagesByChat.mockReturnValue([]);

        const res = await request(createApp()).get("/api/chats/c1/messages");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe("POST /api/chats/:chatId/messages", () => {
    it("returns 404 for non-existent chat", async () => {
        mockGetChat.mockReturnValue(undefined);

        const res = await request(createApp())
            .post("/api/chats/missing/messages")
            .send({ id: "m1", role: "user", content: "hi" });

        expect(res.status).toBe(404);
    });

    it("saves a simple message and bumps chat timestamp", async () => {
        mockGetChat.mockReturnValue({ id: "c1" });

        const res = await request(createApp())
            .post("/api/chats/c1/messages")
            .send({ id: "m1", role: "user", content: "hi" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
        expect(mockCreateMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "m1",
                chat_id: "c1",
                role: "user",
                content: "hi",
            }),
        );
        expect(mockUpdateChatTimestamp).toHaveBeenCalledWith("c1");
    });

    it("serializes tool_calls, tool_results, thinking and stats as JSON", async () => {
        mockGetChat.mockReturnValue({ id: "c1" });

        const toolCalls = [{ id: "tc1", name: "web_search", arguments: '{"query":"test"}' }];
        const toolResults = [{ toolCallId: "tc1", content: "result" }];
        const stats = { ppTime: 50, tokensPerSec: 100, tokenCount: 5 };

        const res = await request(createApp())
            .post("/api/chats/c1/messages")
            .send({
                id: "m2",
                role: "assistant",
                content: "answer",
                thinking: "Let me think",
                toolCalls,
                toolResults,
                stats,
            });

        expect(res.status).toBe(200);
        expect(mockCreateMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "m2",
                chat_id: "c1",
                role: "assistant",
                content: "answer",
                thinking: JSON.stringify("Let me think"),
                tool_calls: JSON.stringify(toolCalls),
                tool_results: JSON.stringify(toolResults),
                stats: JSON.stringify(stats),
            }),
        );
    });

    it("returns 400 when id is missing", async () => {
        mockGetChat.mockReturnValue({ id: "c1" });

        const res = await request(createApp())
            .post("/api/chats/c1/messages")
            .send({ role: "user", content: "hi" });

        expect(res.status).toBe(400);
    });

    it("returns 400 when role is missing", async () => {
        mockGetChat.mockReturnValue({ id: "c1" });

        const res = await request(createApp())
            .post("/api/chats/c1/messages")
            .send({ id: "m1", content: "hi" });

        expect(res.status).toBe(400);
    });
});

describe("POST /api/chats/:chatId/generate-title", () => {
    it("returns 404 for non-existent chat", async () => {
        mockGetChat.mockReturnValue(undefined);

        const res = await request(createApp())
            .post("/api/chats/missing/generate-title");

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Chat not found");
    });

    it("returns 400 when chat has no user message", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([]);

        const res = await request(createApp())
            .post("/api/chats/c1/generate-title");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("No user message found");
    });

    it("returns 400 when LLM is not configured", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "" });
        mockGetMessagesByChat.mockReturnValue([{ role: "user", content: "hello" }]);
        mockGetSetting.mockReturnValue(undefined);

        const res = await request(createApp())
            .post("/api/chats/c1/generate-title");

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("LLM not configured");
    });

    it("returns 502 when LLM API returns error", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([{ role: "user", content: "hello" }]);
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            text: async () => "Internal Server Error",
        });

        const res = await request(createApp())
            .post("/api/chats/c1/generate-title");

        expect(res.status).toBe(502);
        expect(res.body.error).toContain("Title generation failed");
    });

    it("returns 500 when LLM returns empty title", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([{ role: "user", content: "hello" }]);
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: "" } }],
            }),
        });

        const res = await request(createApp())
            .post("/api/chats/c1/generate-title");

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Empty title generated");
    });

    it("generates and returns a title", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([{ role: "user", content: "hello" }]);
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: "Quick greeting chat" } }],
            }),
        });

        const res = await request(createApp())
            .post("/api/chats/c1/generate-title");

        expect(res.status).toBe(200);
        expect(res.body.title).toBe("Quick greeting chat");
        expect(mockUpdateChatTitle).toHaveBeenCalledWith("c1", "Quick greeting chat");
    });

    it("strips quotes and trailing period from title", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([{ role: "user", content: "hello" }]);
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '"Python help."' } }],
            }),
        });

        const res = await request(createApp())
            .post("/api/chats/c1/generate-title");

        expect(res.status).toBe(200);
        expect(res.body.title).toBe("Python help");
    });

    it("falls back to selectedModel setting when chat has no model", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "" });
        mockGetMessagesByChat.mockReturnValue([{ role: "user", content: "hello" }]);
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "selectedModel") return "fallback-model";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: "Fallback title" } }],
            }),
        });

        const res = await request(createApp())
            .post("/api/chats/c1/generate-title");

        expect(res.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledWith(
            "http://llm.example.com/v1/chat/completions",
            expect.objectContaining({
                body: expect.stringContaining('"fallback-model"'),
            }),
        );
    });

    it("returns 500 on network failure", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([{ role: "user", content: "hello" }]);
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

        const res = await request(createApp())
            .post("/api/chats/c1/generate-title");

        expect(res.status).toBe(500);
        expect(res.body.error).toContain("ECONNREFUSED");
    });
});
