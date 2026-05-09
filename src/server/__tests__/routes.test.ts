import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockGetSetting = vi.fn();
const mockSetSetting = vi.fn();
const mockGetAllSettings = vi.fn();

vi.mock("../database.js", () => ({
    getSetting: mockGetSetting,
    setSetting: mockSetSetting,
    getAllSettings: mockGetAllSettings,
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
        });
    });

    it("returns empty strings when no settings exist", async () => {
        mockGetAllSettings.mockReturnValue({});

        const res = await request(createApp()).get("/api/settings");

        expect(res.body).toEqual({ baseUrl: "", apiKey: "" });
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
