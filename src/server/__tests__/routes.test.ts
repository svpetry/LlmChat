import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockGetSetting = vi.fn();
const mockSetSetting = vi.fn();
const mockGetAllSettings = vi.fn();
const mockSearchBrave = vi.fn();
const mockSearchSearxng = vi.fn();
const mockFetchWebsiteContent = vi.fn();
const mockExecuteHomeFileTool = vi.fn();
const mockCreateChat = vi.fn();
const mockGetChat = vi.fn();
const mockUpdateChatTitle = vi.fn();
const mockUpdateChatTimestamp = vi.fn();
const mockDeleteChat = vi.fn();
const mockListChats = vi.fn();
const mockCreateMessage = vi.fn();
const mockGetMessagesByChat = vi.fn();
const mockCreateMemory = vi.fn();
const mockSearchMemories = vi.fn();
const mockListMemories = vi.fn();
const mockUpdateMemory = vi.fn();
const mockDeleteMemory = vi.fn();
const mockClearMemories = vi.fn();

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
    createMemory: mockCreateMemory,
    searchMemories: mockSearchMemories,
    listMemories: mockListMemories,
    updateMemory: mockUpdateMemory,
    deleteMemory: mockDeleteMemory,
    clearMemories: mockClearMemories,
}));

vi.mock("../search.js", () => ({
    fetchWebsiteContent: mockFetchWebsiteContent,
    searchBrave: mockSearchBrave,
    searchSearxng: mockSearchSearxng,
    readWebsiteTool: {
        type: "function",
        function: {
            name: "read_website",
            description: "Read a website",
            parameters: {
                type: "object",
                properties: { url: { type: "string" } },
                required: ["url"],
            },
        },
    },
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

vi.mock("../fileAccess.js", () => ({
    executeHomeFileTool: mockExecuteHomeFileTool,
    homeFileTools: [
        {
            type: "function",
            function: {
                name: "list_home_directory",
                description: "List files",
                parameters: { type: "object", properties: {} },
            },
        },
        {
            type: "function",
            function: {
                name: "read_home_file",
                description: "Read file",
                parameters: { type: "object", properties: {} },
            },
        },
        {
            type: "function",
            function: {
                name: "read_home_image",
                description: "Display image",
                parameters: { type: "object", properties: {} },
            },
        },
        {
            type: "function",
            function: {
                name: "download_home_file",
                description: "Download file",
                parameters: { type: "object", properties: {} },
            },
        },
    ],
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { router } = await import("../routes/index.js");

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

        expect(res.body).toEqual({
            baseUrl: "",
            apiKey: "",
            selectedModel: "",
        });
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

describe("file access settings", () => {
    it("defaults home directory file access to disabled", async () => {
        mockGetAllSettings.mockReturnValue({});

        const res = await request(createApp()).get("/api/file-access-settings");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ enabled: false });
    });

    it("returns stored home directory file access setting", async () => {
        mockGetAllSettings.mockReturnValue({
            homeFileAccessEnabled: "true",
        });

        const res = await request(createApp()).get("/api/file-access-settings");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ enabled: true });
    });

    it("saves home directory file access setting", async () => {
        const res = await request(createApp())
            .post("/api/file-access-settings")
            .send({ enabled: true });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
        expect(mockSetSetting).toHaveBeenCalledWith(
            "homeFileAccessEnabled",
            "true",
        );
    });
});

describe("memory settings", () => {
    it("defaults memory to disabled", async () => {
        mockGetAllSettings.mockReturnValue({});

        const res = await request(createApp()).get("/api/memory-settings");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ enabled: false });
    });

    it("returns stored memory setting", async () => {
        mockGetAllSettings.mockReturnValue({
            memoryEnabled: "true",
        });

        const res = await request(createApp()).get("/api/memory-settings");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ enabled: true });
    });

    it("saves memory setting", async () => {
        const res = await request(createApp())
            .post("/api/memory-settings")
            .send({ enabled: true });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
        expect(mockSetSetting).toHaveBeenCalledWith("memoryEnabled", "true");
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
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
            messages: { role: string; content: string }[];
        };
        expect(body.messages[0]).toEqual(
            expect.objectContaining({
                role: "system",
                content: expect.stringContaining("Current date and time:"),
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
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [{ delta: { content: "<|channel>" } }],
                    }),
                    sseData({
                        choices: [{ delta: { content: "thought " } }],
                    }),
                    sseData({
                        choices: [{ delta: { content: "<channel|>Here" } }],
                    }),
                    sseData({
                        choices: [{ delta: { content: " is the answer." } }],
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

    it("executes read_website tool calls without search provider credentials", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "searchEnabled") return "true";
            if (key === "searchProvider") return "brave";
            return undefined;
        });
        mockFetchWebsiteContent.mockResolvedValue({
            title: "Example Article",
            url: "https://en.wikipedia.org/wiki/Example",
            content: "Article text from the page",
            contentType: "text/html",
            truncated: false,
        });

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
                                            id: "call_read",
                                            type: "function",
                                            function: {
                                                name: "read_website",
                                                arguments:
                                                    '{"url":"https://en.wikipedia.org/wiki/Example"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [
                            { delta: { content: "I read the article." } },
                        ],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "read this article" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("Read Example Article");
        expect(res.text).toContain("I read the article.");
        expect(mockFetchWebsiteContent).toHaveBeenCalledWith(
            "https://en.wikipedia.org/wiki/Example",
        );
        expect(mockSearchBrave).not.toHaveBeenCalled();

        const firstBody = JSON.parse(
            mockFetch.mock.calls[0][1].body as string,
        ) as { tools: { function: { name: string } }[] };
        expect(firstBody.tools.map((tool) => tool.function.name)).toEqual([
            "read_website",
        ]);

        const secondBody = JSON.parse(
            mockFetch.mock.calls[1][1].body as string,
        ) as { messages: { role: string; content: string }[] };
        expect(secondBody.messages).toContainEqual(
            expect.objectContaining({
                role: "tool",
                content: expect.stringContaining("Article text from the page"),
            }),
        );
    });

    it("emits image data for direct image URLs fetched by read_website", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "searchEnabled") return "true";
            if (key === "searchProvider") return "brave";
            return undefined;
        });
        mockFetchWebsiteContent.mockResolvedValue({
            title: "anime_girl.png",
            url: "https://example.com/anime_girl.png",
            content: [
                "Image: anime_girl.png",
                "MIME type: image/png",
                "Bytes: 68",
                "Displayed to user: true",
            ].join("\n"),
            contentType: "image/png",
            truncated: false,
            image: {
                name: "anime_girl.png",
                mimeType: "image/png",
                bytes: 68,
                dataUrl: "data:image/png;base64,abc",
            },
        });

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
                                            id: "call_read_image",
                                            type: "function",
                                            function: {
                                                name: "read_website",
                                                arguments:
                                                    '{"url":"https://example.com/anime_girl.png"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [
                            { delta: { content: "I fetched the image." } },
                        ],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "show this image" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("Fetched image anime_girl.png");
        expect(res.text).toContain("data:image/png;base64,abc");
        expect(res.text).toContain("I fetched the image.");

        const secondBody = JSON.parse(
            mockFetch.mock.calls[1][1].body as string,
        ) as { messages: { role: string; content: string }[] };
        expect(secondBody.messages).toContainEqual(
            expect.objectContaining({
                role: "tool",
                content: expect.stringContaining("Displayed to user: true"),
            }),
        );
        expect(JSON.stringify(secondBody)).not.toContain("data:image/png");
    });

    it("routes URL-shaped web_search calls through read_website instead of Brave", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "searchEnabled") return "true";
            if (key === "searchProvider") return "brave";
            if (key === "searchApiKey") return "search-key";
            return undefined;
        });
        mockFetchWebsiteContent.mockResolvedValue({
            title: "cdn.waifu.im",
            url: "https://cdn.waifu.im/api/v1/images/random",
            content: JSON.stringify({
                images: [{ url: "https://cdn.waifu.im/image.png" }],
            }),
            contentType: "application/json",
            truncated: false,
        });

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
                                            id: "call_wrong_tool",
                                            type: "function",
                                            function: {
                                                name: "web_search",
                                                arguments:
                                                    '{"query":"https://cdn.waifu.im/api/v1/images/random"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [
                            { delta: { content: "I found the image URL." } },
                        ],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [
                    {
                        role: "user",
                        content:
                            "show https://cdn.waifu.im/api/v1/images/random",
                    },
                ],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("Read cdn.waifu.im");
        expect(mockFetchWebsiteContent).toHaveBeenCalledWith(
            "https://cdn.waifu.im/api/v1/images/random",
        );
        expect(mockSearchBrave).not.toHaveBeenCalled();
    });

    it("advertises home file tools only when home file access is enabled", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "homeFileAccessEnabled") return "true";
            return undefined;
        });
        mockFetch.mockResolvedValue(
            createStreamResponse([
                sseData({
                    choices: [{ delta: { content: "Ready." } }],
                }),
                "data: [DONE]\n\n",
            ]),
        );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "list files" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
            tools: { function: { name: string } }[];
        };
        expect(body.tools.map((tool) => tool.function.name)).toEqual([
            "list_home_directory",
            "read_home_file",
            "read_home_image",
            "download_home_file",
        ]);
    });

    it("does not advertise home file tools when home file access is disabled", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockResolvedValue({
            ok: true,
            body: {
                getReader: () => ({
                    read: vi.fn(async () => ({ done: true })),
                }),
            },
        });

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "list files" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
            tools?: unknown[];
        };
        expect(body.tools).toBeUndefined();
    });

    it("refuses home file tool calls when home file access is disabled", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "searchEnabled") return "true";
            if (key === "searchProvider") return "brave";
            return undefined;
        });

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
                                            id: "call_file",
                                            type: "function",
                                            function: {
                                                name: "read_home_file",
                                                arguments:
                                                    '{"path":"notes.txt"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [{ delta: { content: "Could not read it." } }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "read notes" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain(
            "Error: Home directory file access is disabled",
        );
        expect(res.text).toContain("Could not read it.");
        expect(mockExecuteHomeFileTool).not.toHaveBeenCalled();
    });

    it("executes home file tool calls when enabled", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "homeFileAccessEnabled") return "true";
            return undefined;
        });
        mockExecuteHomeFileTool.mockResolvedValue({
            summary: "Read ~/notes.txt",
            content: "file contents",
        });

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
                                            id: "call_file",
                                            type: "function",
                                            function: {
                                                name: "read_home_file",
                                                arguments:
                                                    '{"path":"notes.txt"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [{ delta: { content: "Done." } }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "read notes" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("Read ~/notes.txt");
        expect(res.text).toContain("Done.");
        expect(mockExecuteHomeFileTool).toHaveBeenCalledWith(
            "read_home_file",
            '{"path":"notes.txt"}',
        );

        const secondBody = JSON.parse(
            mockFetch.mock.calls[1][1].body as string,
        ) as { messages: { role: string; content: string }[] };
        expect(secondBody.messages).toContainEqual(
            expect.objectContaining({
                role: "tool",
                content: "file contents",
            }),
        );
    });

    it("emits image data for read_home_image tool results", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "homeFileAccessEnabled") return "true";
            return undefined;
        });
        mockExecuteHomeFileTool.mockResolvedValue({
            summary: "Displayed ~/photo.png",
            content: '{"displayedToUser":true}',
            image: {
                path: "~/photo.png",
                name: "photo.png",
                mimeType: "image/png",
                bytes: 68,
                dataUrl: "data:image/png;base64,abc",
            },
        });

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
                                            id: "call_image",
                                            type: "function",
                                            function: {
                                                name: "read_home_image",
                                                arguments:
                                                    '{"path":"photo.png"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [
                            { delta: { content: "That image is shown." } },
                        ],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "show photo" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("Displayed ~/photo.png");
        expect(res.text).toContain("data:image/png;base64,abc");
        expect(mockExecuteHomeFileTool).toHaveBeenCalledWith(
            "read_home_image",
            '{"path":"photo.png"}',
        );

        const secondBody = JSON.parse(
            mockFetch.mock.calls[1][1].body as string,
        ) as { messages: { role: string; content: string }[] };
        expect(secondBody.messages).toContainEqual(
            expect.objectContaining({
                role: "tool",
                content: '{"displayedToUser":true}',
            }),
        );
        expect(JSON.stringify(secondBody)).not.toContain("data:image/png");
    });

    it("executes download_home_file tool calls when enabled", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "homeFileAccessEnabled") return "true";
            return undefined;
        });
        mockExecuteHomeFileTool.mockResolvedValue({
            summary: "Downloaded ~/anime_girl.png",
            content:
                '{"path":"~/anime_girl.png","sourceUrl":"https://example.com/anime_girl.png","bytes":68}',
        });

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
                                            id: "call_download",
                                            type: "function",
                                            function: {
                                                name: "download_home_file",
                                                arguments:
                                                    '{"url":"https://example.com/anime_girl.png","path":"anime_girl.png","overwrite":true}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [{ delta: { content: "Downloaded." } }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "download this image" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("Downloaded ~/anime_girl.png");
        expect(res.text).toContain("Downloaded.");
        expect(mockExecuteHomeFileTool).toHaveBeenCalledWith(
            "download_home_file",
            '{"url":"https://example.com/anime_girl.png","path":"anime_girl.png","overwrite":true}',
        );
    });

    it("advertises memory tools and tells the model about memory when enabled", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "memoryEnabled") return "true";
            return undefined;
        });
        mockFetch.mockResolvedValue(
            createStreamResponse([
                sseData({
                    choices: [{ delta: { content: "Ready." } }],
                }),
                "data: [DONE]\n\n",
            ]),
        );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "remember things" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
            messages: { role: string; content: string }[];
            tools: { function: { name: string } }[];
        };
        expect(body.tools.map((tool) => tool.function.name)).toEqual([
            "save_memory",
            "search_memory",
            "list_memories",
            "update_memory",
            "delete_memory",
            "clear_memories",
        ]);
        expect(body.messages[0]).toEqual(
            expect.objectContaining({
                role: "system",
                content: expect.stringContaining("Current date and time:"),
            }),
        );
        expect(body.messages[1]).toEqual(
            expect.objectContaining({
                role: "system",
                content: expect.stringContaining("Memory is enabled"),
            }),
        );
    });

    it("executes memory save tool calls when enabled", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "memoryEnabled") return "true";
            return undefined;
        });
        mockCreateMemory.mockReturnValue({
            id: "mem-1",
            content: "User prefers concise answers",
            importance: 3,
            created_at: 1000,
            updated_at: 1000,
        });

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
                                            id: "call_memory",
                                            type: "function",
                                            function: {
                                                name: "save_memory",
                                                arguments:
                                                    '{"content":"User prefers concise answers"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [
                            { delta: { content: "I will remember it." } },
                        ],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [
                    {
                        role: "user",
                        content: "Remember that I prefer concise answers",
                    },
                ],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("Saved memory");
        expect(res.text).toContain("I will remember it.");
        expect(mockCreateMemory).toHaveBeenCalledWith(
            expect.any(String),
            "User prefers concise answers",
            undefined,
        );

        const secondBody = JSON.parse(
            mockFetch.mock.calls[1][1].body as string,
        ) as { messages: { role: string; content: string }[] };
        expect(secondBody.messages).toContainEqual(
            expect.objectContaining({
                role: "tool",
                content: expect.stringContaining(
                    "User prefers concise answers",
                ),
            }),
        );
    });

    it("executes memory search tool calls when enabled", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "memoryEnabled") return "true";
            return undefined;
        });
        mockSearchMemories.mockReturnValue([
            {
                id: "mem-espresso",
                content: "User loves espresso",
                importance: 5,
                created_at: 1000,
                updated_at: 2000,
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
                                            id: "call_search_memory",
                                            type: "function",
                                            function: {
                                                name: "search_memory",
                                                arguments:
                                                    '{"query":"coffee preferences","maxResults":3}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [{ delta: { content: "You like espresso." } }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "What coffee do I like?" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("Found 1 memory");
        expect(res.text).toContain("You like espresso.");
        expect(mockSearchMemories).toHaveBeenCalledWith(
            "coffee preferences",
            3,
        );

        const secondBody = JSON.parse(
            mockFetch.mock.calls[1][1].body as string,
        ) as { messages: { role: string; content: string }[] };
        expect(secondBody.messages).toContainEqual(
            expect.objectContaining({
                role: "tool",
                content: expect.stringContaining("User loves espresso"),
            }),
        );
    });

    it("executes memory management tool calls when enabled", async () => {
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            if (key === "memoryEnabled") return "true";
            return undefined;
        });
        mockListMemories.mockReturnValue([
            {
                id: "mem-1",
                content: "User likes espresso",
                importance: 3,
                created_at: 1000,
                updated_at: 1000,
            },
        ]);
        mockUpdateMemory.mockReturnValue({
            id: "mem-1",
            content: "User prefers matcha",
            importance: 4,
            created_at: 1000,
            updated_at: 2000,
        });
        mockDeleteMemory.mockReturnValue(true);
        mockClearMemories.mockReturnValue(1);

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
                                            id: "call_list_memories",
                                            type: "function",
                                            function: {
                                                name: "list_memories",
                                                arguments: '{"maxResults":5}',
                                            },
                                        },
                                        {
                                            index: 1,
                                            id: "call_update_memory",
                                            type: "function",
                                            function: {
                                                name: "update_memory",
                                                arguments:
                                                    '{"id":"mem-1","content":"User prefers matcha","importance":4}',
                                            },
                                        },
                                        {
                                            index: 2,
                                            id: "call_delete_memory",
                                            type: "function",
                                            function: {
                                                name: "delete_memory",
                                                arguments: '{"id":"mem-1"}',
                                            },
                                        },
                                        {
                                            index: 3,
                                            id: "call_clear_memories",
                                            type: "function",
                                            function: {
                                                name: "clear_memories",
                                                arguments: '{"confirm":true}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    }),
                    sseData({
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                    }),
                    "data: [DONE]\n\n",
                ]),
            )
            .mockResolvedValueOnce(
                createStreamResponse([
                    sseData({
                        choices: [
                            { delta: { content: "Memory is up to date." } },
                        ],
                    }),
                    "data: [DONE]\n\n",
                ]),
            );

        const res = await request(createApp())
            .post("/api/chat")
            .send({
                messages: [{ role: "user", content: "Update my memories" }],
                model: "gpt-4",
                toolsEnabled: true,
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("Listed 1 memory");
        expect(res.text).toContain("Updated memory");
        expect(res.text).toContain("Deleted memory");
        expect(res.text).toContain("Cleared 1 memory");
        expect(res.text).toContain("Memory is up to date.");
        expect(mockListMemories).toHaveBeenCalledWith(5);
        expect(mockUpdateMemory).toHaveBeenCalledWith(
            "mem-1",
            "User prefers matcha",
            4,
        );
        expect(mockDeleteMemory).toHaveBeenCalledWith("mem-1");
        expect(mockClearMemories).toHaveBeenCalled();

        const secondBody = JSON.parse(
            mockFetch.mock.calls[1][1].body as string,
        ) as { messages: { role: string; content: string }[] };
        const toolMessages = secondBody.messages.filter(
            (message) => message.role === "tool",
        );
        expect(toolMessages).toHaveLength(4);
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
            {
                id: "c1",
                title: "Chat 1",
                model: "gpt-4",
                created_at: 1000,
                updated_at: 2000,
            },
        ]);

        const res = await request(createApp()).get("/api/chats");

        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            {
                id: "c1",
                title: "Chat 1",
                model: "gpt-4",
                createdAt: 1000,
                updatedAt: 2000,
            },
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
            id: "new-1",
            title: "New Chat",
            model: "gpt-4",
            created_at: 1000,
            updated_at: 1000,
        });

        const res = await request(createApp())
            .post("/api/chats")
            .send({ id: "new-1", model: "gpt-4" });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            id: "new-1",
            title: "New Chat",
            model: "gpt-4",
            createdAt: 1000,
            updatedAt: 1000,
        });
        expect(mockCreateChat).toHaveBeenCalledWith("new-1", "gpt-4");
    });

    it("defaults model to empty string when not provided", async () => {
        mockCreateChat.mockReturnValue({
            id: "new-2",
            title: "New Chat",
            model: "",
            created_at: 1000,
            updated_at: 1000,
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
            id: "c1",
            title: "Test Chat",
            model: "gpt-4",
            created_at: 1000,
            updated_at: 2000,
        });

        const res = await request(createApp()).get("/api/chats/c1");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            id: "c1",
            title: "Test Chat",
            model: "gpt-4",
            createdAt: 1000,
            updatedAt: 2000,
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
        const res = await request(createApp()).patch("/api/chats/c1").send({});

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

        const res = await request(createApp()).get(
            "/api/chats/missing/messages",
        );

        expect(res.status).toBe(404);
    });

    it("returns deserialized messages", async () => {
        mockGetChat.mockReturnValue({ id: "c1" });
        mockGetMessagesByChat.mockReturnValue([
            {
                id: "m1",
                chat_id: "c1",
                role: "user",
                content: "hi",
                thinking: null,
                tool_calls: null,
                tool_results: null,
                stats: null,
                created_at: 1000,
            },
            {
                id: "m2",
                chat_id: "c1",
                role: "assistant",
                content: "hello",
                thinking: null,
                tool_calls: JSON.stringify([
                    { id: "tc1", name: "web_search", arguments: "{}" },
                ]),
                tool_results: JSON.stringify([
                    { toolCallId: "tc1", content: "result" },
                ]),
                stats: JSON.stringify({
                    ppTime: 50,
                    tokensPerSec: 100,
                    tokenCount: 5,
                }),
                created_at: 2000,
            },
        ]);

        const res = await request(createApp()).get("/api/chats/c1/messages");

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
        expect(res.body[0].role).toBe("user");
        expect(res.body[0].content).toBe("hi");
        expect(res.body[1].toolCalls).toEqual([
            { id: "tc1", name: "web_search", arguments: "{}" },
        ]);
        expect(res.body[1].stats).toEqual({
            ppTime: 50,
            tokensPerSec: 100,
            tokenCount: 5,
        });
    });

    it("deserializes thinking field", async () => {
        mockGetChat.mockReturnValue({ id: "c1" });
        mockGetMessagesByChat.mockReturnValue([
            {
                id: "m1",
                chat_id: "c1",
                role: "assistant",
                content: "answer",
                thinking: JSON.stringify("Let me think about this"),
                tool_calls: null,
                tool_results: null,
                stats: null,
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

        const toolCalls = [
            { id: "tc1", name: "web_search", arguments: '{"query":"test"}' },
        ];
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

        const res = await request(createApp()).post(
            "/api/chats/missing/generate-title",
        );

        expect(res.status).toBe(404);
        expect(res.body.error).toBe("Chat not found");
    });

    it("returns 400 when chat has no user message", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([]);

        const res = await request(createApp()).post(
            "/api/chats/c1/generate-title",
        );

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("No user message found");
    });

    it("returns 400 when LLM is not configured", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "" });
        mockGetMessagesByChat.mockReturnValue([
            { role: "user", content: "hello" },
        ]);
        mockGetSetting.mockReturnValue(undefined);

        const res = await request(createApp()).post(
            "/api/chats/c1/generate-title",
        );

        expect(res.status).toBe(400);
        expect(res.body.error).toBe("LLM not configured");
    });

    it("returns 502 when LLM API returns error", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([
            { role: "user", content: "hello" },
        ]);
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

        const res = await request(createApp()).post(
            "/api/chats/c1/generate-title",
        );

        expect(res.status).toBe(502);
        expect(res.body.error).toContain("Title generation failed");
    });

    it("returns 500 when LLM returns empty title", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([
            { role: "user", content: "hello" },
        ]);
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

        const res = await request(createApp()).post(
            "/api/chats/c1/generate-title",
        );

        expect(res.status).toBe(500);
        expect(res.body.error).toBe("Empty title generated");
    });

    it("generates and returns a title", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([
            { role: "user", content: "hello" },
        ]);
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

        const res = await request(createApp()).post(
            "/api/chats/c1/generate-title",
        );

        expect(res.status).toBe(200);
        expect(res.body.title).toBe("Quick greeting chat");
        expect(mockUpdateChatTitle).toHaveBeenCalledWith(
            "c1",
            "Quick greeting chat",
        );
    });

    it("strips quotes and trailing period from title", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "gpt-4" });
        mockGetMessagesByChat.mockReturnValue([
            { role: "user", content: "hello" },
        ]);
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

        const res = await request(createApp()).post(
            "/api/chats/c1/generate-title",
        );

        expect(res.status).toBe(200);
        expect(res.body.title).toBe("Python help");
    });

    it("falls back to selectedModel setting when chat has no model", async () => {
        mockGetChat.mockReturnValue({ id: "c1", model: "" });
        mockGetMessagesByChat.mockReturnValue([
            { role: "user", content: "hello" },
        ]);
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

        const res = await request(createApp()).post(
            "/api/chats/c1/generate-title",
        );

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
        mockGetMessagesByChat.mockReturnValue([
            { role: "user", content: "hello" },
        ]);
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "baseUrl") return "http://llm.example.com/v1";
            if (key === "apiKey") return "key";
            return undefined;
        });
        mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

        const res = await request(createApp()).post(
            "/api/chats/c1/generate-title",
        );

        expect(res.status).toBe(500);
        expect(res.body.error).toContain("ECONNREFUSED");
    });
});
