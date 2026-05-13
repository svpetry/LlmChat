import { randomUUID } from "node:crypto";
import {
    clearMemories,
    createMemory,
    deleteMemory,
    listMemories,
    searchMemories,
    updateMemory,
    type MemoryRow,
} from "./database.js";

const MAX_MEMORY_CONTENT_CHARS = 4_000;
const MAX_MEMORY_RESULTS = 20;

type MemoryToolResult = { summary: string; content: string };

export const memoryTools = [
    {
        type: "function" as const,
        function: {
            name: "save_memory",
            description:
                "Store a durable memory about the user or their preferences. Use this only when the user explicitly asks you to remember, save, or keep something for later.",
            parameters: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description:
                            "The concise fact or preference to remember.",
                    },
                    importance: {
                        type: "number",
                        description:
                            "Optional importance from 1 to 5. Use 3 for ordinary memories and 5 for core preferences or identity facts.",
                    },
                },
                required: ["content"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "search_memory",
            description:
                "Search durable memories for facts or preferences the user previously asked you to remember. Results are ranked by relevance, recency, and importance. Use this when remembered information may help answer the user.",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description:
                            "Keywords to search for in remembered facts and preferences.",
                    },
                    maxResults: {
                        type: "number",
                        description:
                            "Maximum matching memories to return. Defaults to 10.",
                    },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "list_memories",
            description:
                "List the user's stored memories, newest and most recently updated first. Use this when the user asks what you remember.",
            parameters: {
                type: "object",
                properties: {
                    maxResults: {
                        type: "number",
                        description:
                            "Maximum memories to return. Defaults to 25.",
                    },
                },
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "update_memory",
            description:
                "Update an existing memory by id. Use this when the user corrects or changes something already remembered.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description:
                            "The id of the memory to update. Search or list memories first if you do not know it.",
                    },
                    content: {
                        type: "string",
                        description:
                            "The replacement memory text. Keep it concise and current.",
                    },
                    importance: {
                        type: "number",
                        description:
                            "Optional importance from 1 to 5. Leave omitted to keep the previous importance.",
                    },
                },
                required: ["id", "content"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "delete_memory",
            description:
                "Delete one stored memory by id. Use this when the user asks you to forget a specific remembered fact.",
            parameters: {
                type: "object",
                properties: {
                    id: {
                        type: "string",
                        description:
                            "The id of the memory to delete. Search or list memories first if you do not know it.",
                    },
                },
                required: ["id"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "clear_memories",
            description:
                "Delete all stored memories. Use this only when the user clearly asks to clear all memories.",
            parameters: {
                type: "object",
                properties: {
                    confirm: {
                        type: "boolean",
                        description:
                            "Must be true to confirm clearing every memory.",
                    },
                },
                required: ["confirm"],
            },
        },
    },
] as const;

export function executeMemoryTool(
    name: string,
    rawArguments: string,
): MemoryToolResult {
    let args: Record<string, unknown>;
    try {
        args = JSON.parse(rawArguments) as Record<string, unknown>;
    } catch {
        throw new Error("Invalid tool call arguments");
    }

    switch (name) {
        case "save_memory":
            return saveMemory(args);
        case "search_memory":
            return searchMemory(args);
        case "list_memories":
            return listMemory(args);
        case "update_memory":
            return updateMemoryTool(args);
        case "delete_memory":
            return deleteMemoryTool(args);
        case "clear_memories":
            return clearMemory(args);
        default:
            throw new Error(`Unknown memory tool: ${name}`);
    }
}

function saveMemory(args: Record<string, unknown>): MemoryToolResult {
    const content = requireString(args.content, "content").slice(
        0,
        MAX_MEMORY_CONTENT_CHARS,
    );
    const importance = getOptionalNumber(args.importance);
    const memory = createMemory(randomUUID(), content, importance);
    return jsonResult("Saved memory", formatMemory(memory));
}

function searchMemory(args: Record<string, unknown>): MemoryToolResult {
    const query = requireString(args.query, "query");
    const maxResults = clampNumber(args.maxResults, 1, MAX_MEMORY_RESULTS, 10);
    const memories = searchMemories(query, maxResults);

    return jsonResult(
        `Found ${memories.length} memor${memories.length === 1 ? "y" : "ies"}`,
        {
            query,
            memories: memories.map(formatMemory),
        },
    );
}

function listMemory(args: Record<string, unknown>): MemoryToolResult {
    const maxResults = clampNumber(args.maxResults, 1, 100, 25);
    const memories = listMemories(maxResults);

    return jsonResult(
        `Listed ${memories.length} memor${memories.length === 1 ? "y" : "ies"}`,
        { memories: memories.map(formatMemory) },
    );
}

function updateMemoryTool(args: Record<string, unknown>): MemoryToolResult {
    const id = requireString(args.id, "id");
    const content = requireString(args.content, "content").slice(
        0,
        MAX_MEMORY_CONTENT_CHARS,
    );
    const memory = updateMemory(
        id,
        content,
        getOptionalNumber(args.importance),
    );
    if (!memory) {
        throw new Error("Memory not found");
    }

    return jsonResult("Updated memory", formatMemory(memory));
}

function deleteMemoryTool(args: Record<string, unknown>): MemoryToolResult {
    const id = requireString(args.id, "id");
    const deleted = deleteMemory(id);
    if (!deleted) {
        throw new Error("Memory not found");
    }

    return jsonResult("Deleted memory", { id });
}

function clearMemory(args: Record<string, unknown>): MemoryToolResult {
    if (args.confirm !== true) {
        throw new Error("confirm must be true to clear all memories");
    }

    const deletedCount = clearMemories();
    return jsonResult(
        `Cleared ${deletedCount} memor${deletedCount === 1 ? "y" : "ies"}`,
        { deletedCount },
    );
}

function formatMemory(memory: MemoryRow) {
    return {
        id: memory.id,
        content: memory.content,
        importance: memory.importance,
        createdAt: new Date(memory.created_at).toISOString(),
        updatedAt: new Date(memory.updated_at).toISOString(),
    };
}

function requireString(value: unknown, name: string) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Missing ${name} parameter`);
    }
    return value.trim();
}

function clampNumber(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

function getOptionalNumber(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }
    return Math.trunc(value);
}

function jsonResult(summary: string, payload: unknown): MemoryToolResult {
    return { summary, content: JSON.stringify(payload, null, 2) };
}
