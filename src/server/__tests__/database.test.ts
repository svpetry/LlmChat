import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
    getSetting,
    setSetting,
    getAllSettings,
    createChat,
    getChat,
    updateChatTitle,
    deleteChat,
    listChats,
    createMessage,
    getMessagesByChat,
    createMemory,
    deleteMemory,
    getMemory,
    searchMemories,
    updateMemory,
} from "../database.js";

describe("database", () => {
    beforeEach(() => {
        // Settings are cleared implicitly — tests use unique keys
        getAllSettings();
    });

    it("returns undefined for a non-existent key", () => {
        expect(getSetting("nonexistent")).toBeUndefined();
    });

    it("saves and retrieves a setting", () => {
        setSetting("testKey", "testValue");
        expect(getSetting("testKey")).toBe("testValue");
    });

    it("overwrites an existing setting", () => {
        setSetting("overwriteKey", "first");
        setSetting("overwriteKey", "second");
        expect(getSetting("overwriteKey")).toBe("second");
    });

    it("getAllSettings returns all saved settings", () => {
        setSetting("k1", "v1");
        setSetting("k2", "v2");

        const all = getAllSettings();
        expect(all.k1).toBe("v1");
        expect(all.k2).toBe("v2");
    });
});

describe("chats", () => {
    beforeEach(() => {
        deleteChat("chat-1-test");
        deleteChat("chat-title-test");
        deleteChat("chat-del-test");
        deleteChat("chat-a-sort");
        deleteChat("chat-b-sort");
    });

    it("creates and retrieves a chat", () => {
        const chat = createChat("chat-1-test", "gpt-4");
        expect(chat.id).toBe("chat-1-test");
        expect(chat.title).toBe("New Chat");
        expect(chat.model).toBe("gpt-4");

        const retrieved = getChat("chat-1-test");
        expect(retrieved).toEqual(chat);
    });

    it("returns undefined for non-existent chat", () => {
        expect(getChat("nonexistent")).toBeUndefined();
    });

    it("lists chats ordered by updated_at DESC", () => {
        const dateNow = vi.spyOn(Date, "now");
        dateNow.mockReturnValueOnce(1000);
        createChat("chat-a-sort", "model-a");
        dateNow.mockReturnValueOnce(2000);
        createChat("chat-b-sort", "model-b");
        dateNow.mockRestore();

        const chats = listChats();
        const chatBIdx = chats.findIndex((c) => c.id === "chat-b-sort");
        const chatAIdx = chats.findIndex((c) => c.id === "chat-a-sort");
        expect(chatBIdx).toBeLessThan(chatAIdx);
    });

    it("updates chat title", () => {
        createChat("chat-title-test", "gpt-4");
        updateChatTitle("chat-title-test", "My New Title");

        const chat = getChat("chat-title-test")!;
        expect(chat.title).toBe("My New Title");
    });

    it("deletes a chat and its messages", () => {
        createChat("chat-del-test", "gpt-4");
        createMessage({
            id: "msg-del-test",
            chat_id: "chat-del-test",
            role: "user",
            content: "hello",
            created_at: Date.now(),
        });

        deleteChat("chat-del-test");
        expect(getChat("chat-del-test")).toBeUndefined();
        expect(getMessagesByChat("chat-del-test")).toEqual([]);
    });
});

describe("messages", () => {
    const chatId = "msg-chat-test";

    beforeEach(() => {
        deleteChat(chatId);
        createChat(chatId, "gpt-4");
    });

    it("returns empty array for chat with no messages", () => {
        expect(getMessagesByChat(chatId)).toEqual([]);
    });

    it("creates and retrieves messages for a chat", () => {
        createMessage({
            id: "msg-1-test",
            chat_id: chatId,
            role: "user",
            content: "Hello",
            created_at: Date.now(),
        });
        createMessage({
            id: "msg-2-test",
            chat_id: chatId,
            role: "assistant",
            content: "Hi there",
            stats: JSON.stringify({
                ppTime: 100,
                tokensPerSec: 50,
                tokenCount: 10,
            }),
            created_at: Date.now(),
        });

        const msgs = getMessagesByChat(chatId);
        expect(msgs).toHaveLength(2);
        expect(msgs[0].role).toBe("user");
        expect(msgs[0].content).toBe("Hello");
        expect(msgs[1].role).toBe("assistant");
        expect(msgs[1].content).toBe("Hi there");
        expect(JSON.parse(msgs[1].stats!)).toEqual({
            ppTime: 100,
            tokensPerSec: 50,
            tokenCount: 10,
        });
    });

    it("stores and retrieves tool_calls and tool_results as JSON", () => {
        createMessage({
            id: "msg-tools-test",
            chat_id: chatId,
            role: "assistant",
            content: "",
            tool_calls: JSON.stringify([
                {
                    id: "tc-1",
                    name: "web_search",
                    arguments: '{"query":"test"}',
                },
            ]),
            tool_results: JSON.stringify([
                { toolCallId: "tc-1", content: "result" },
            ]),
            created_at: Date.now(),
        });

        const msgs = getMessagesByChat(chatId);
        expect(msgs).toHaveLength(1);
        expect(JSON.parse(msgs[0].tool_calls!)).toEqual([
            { id: "tc-1", name: "web_search", arguments: '{"query":"test"}' },
        ]);
        expect(JSON.parse(msgs[0].tool_results!)).toEqual([
            { toolCallId: "tc-1", content: "result" },
        ]);
    });
});

describe("memories", () => {
    it("creates and searches memories", () => {
        const conciseId = `memory-test-${randomUUID()}`;
        const typescriptId = `memory-test-${randomUUID()}`;
        createMemory(conciseId, "User prefers concise answers");
        createMemory(typescriptId, "User likes TypeScript examples");

        const matches = searchMemories("concise", 5);

        expect(matches).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: conciseId,
                    content: "User prefers concise answers",
                }),
            ]),
        );
        expect(matches.some((memory) => memory.id === typescriptId)).toBe(
            false,
        );
        deleteMemory(conciseId);
        deleteMemory(typescriptId);
    });

    it("escapes wildcard characters in memory searches", () => {
        const wildcardId = `memory-test-${randomUUID()}`;
        const otherId = `memory-test-${randomUUID()}`;
        createMemory(wildcardId, "Literal 100% preference");
        createMemory(otherId, "Another preference");

        const matches = searchMemories("100%", 5);

        expect(matches.map((memory) => memory.id)).toContain(wildcardId);
        expect(matches.map((memory) => memory.id)).not.toContain(otherId);
        deleteMemory(wildcardId);
        deleteMemory(otherId);
    });

    it("finds related memory terms and prioritizes importance", () => {
        const espressoId = `memory-test-${randomUUID()}`;
        const otherId = `memory-test-${randomUUID()}`;
        createMemory(espressoId, "User loves espresso", 5);
        createMemory(otherId, "User likes quiet offices", 1);

        const matches = searchMemories("coffee preferences", 5);

        expect(matches[0]).toEqual(
            expect.objectContaining({
                id: espressoId,
                importance: 5,
            }),
        );
        expect(matches.map((memory) => memory.id)).not.toContain(otherId);
        deleteMemory(espressoId);
        deleteMemory(otherId);
    });

    it("updates and deletes memories", () => {
        const memoryId = `memory-test-${randomUUID()}`;
        createMemory(memoryId, "User likes espresso", 2);

        const updated = updateMemory(memoryId, "User prefers matcha", 4);

        expect(updated).toEqual(
            expect.objectContaining({
                id: memoryId,
                content: "User prefers matcha",
                importance: 4,
            }),
        );
        expect(getMemory(memoryId)?.content).toBe("User prefers matcha");
        expect(deleteMemory(memoryId)).toBe(true);
        expect(getMemory(memoryId)).toBeUndefined();
    });
});
