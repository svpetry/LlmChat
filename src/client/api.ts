import type { ChatSummary, Message, SearchSettings } from "./atoms";

const API = "/api";

export async function fetchSettings(): Promise<{
    baseUrl: string;
    apiKey: string;
    selectedModel: string;
}> {
    const res = await fetch(`${API}/settings`);
    return res.json();
}

export async function saveSettings(data: {
    baseUrl: string;
    apiKey: string;
    selectedModel?: string;
}): Promise<{ ok: boolean }> {
    const res = await fetch(`${API}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return res.json();
}

export async function fetchModels(): Promise<{ models: string[] }> {
    const res = await fetch(`${API}/models`, { method: "POST" });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to fetch models");
    }
    return res.json();
}

export interface StreamChunk {
    content?: string;
    thinking?: string;
    toolCall?: { id: string; name: string; arguments: string };
    toolResult?: { toolCallId: string; content: string };
    clearContent?: boolean;
}

export async function* streamChat(
    messages: Message[],
    model: string,
    signal?: AbortSignal,
    toolsEnabled: boolean = false,
): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, model, toolsEnabled }),
        signal,
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to get response");
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        let currentEvent = "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("event: ")) {
                currentEvent = trimmed.slice(7).trim();
                continue;
            }
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") return;

            try {
                if (currentEvent === "clear_content") {
                    yield { clearContent: true };
                    currentEvent = "";
                    continue;
                }
                if (currentEvent === "tool_call") {
                    const parsed = JSON.parse(data);
                    yield {
                        toolCall: {
                            id: parsed.id,
                            name: parsed.name,
                            arguments: parsed.arguments,
                        },
                    };
                    currentEvent = "";
                    continue;
                }
                if (currentEvent === "tool_result") {
                    const parsed = JSON.parse(data);
                    yield {
                        toolResult: {
                            toolCallId: parsed.toolCallId,
                            content: parsed.content,
                        },
                    };
                    currentEvent = "";
                    continue;
                }

                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;
                const chunk: StreamChunk = {};
                if (delta.content) chunk.content = delta.content;
                const thinking = delta.reasoning_content ?? delta.thinking;
                if (thinking) chunk.thinking = thinking;
                if (chunk.content || chunk.thinking) yield chunk;
            } catch {
                // skip malformed chunks
            }
            currentEvent = "";
        }
    }
}

export async function fetchSearchSettings(): Promise<SearchSettings> {
    const res = await fetch(`${API}/search-settings`);
    return res.json();
}

export async function saveSearchSettings(data: {
    enabled?: boolean;
    provider?: string;
    searchApiKey?: string;
    searxngUrl?: string;
}): Promise<{ ok: boolean }> {
    const res = await fetch(`${API}/search-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return res.json();
}

// --- Chat management ---

export async function fetchChats(): Promise<ChatSummary[]> {
    const res = await fetch(`${API}/chats`);
    return res.json();
}

export async function createChatApi(
    id: string,
    model: string,
): Promise<ChatSummary> {
    const res = await fetch(`${API}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, model }),
    });
    return res.json();
}

export async function deleteChatApi(
    chatId: string,
): Promise<{ ok: boolean }> {
    const res = await fetch(`${API}/chats/${chatId}`, { method: "DELETE" });
    return res.json();
}

export async function fetchMessages(chatId: string): Promise<Message[]> {
    const res = await fetch(`${API}/chats/${chatId}/messages`);
    return res.json();
}

export async function saveMessage(
    chatId: string,
    message: Message & { id: string },
): Promise<{ ok: boolean }> {
    const res = await fetch(`${API}/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
    });
    return res.json();
}

export async function generateChatTitle(
    chatId: string,
): Promise<{ title: string }> {
    const res = await fetch(`${API}/chats/${chatId}/generate-title`, {
        method: "POST",
    });
    if (!res.ok) throw new Error("Failed to generate title");
    return res.json();
}
