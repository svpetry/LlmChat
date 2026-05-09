import type { Message } from "./atoms";

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

export async function* streamChat(
    messages: Message[],
    model: string,
    signal?: AbortSignal,
): AsyncGenerator<string> {
    const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, model }),
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

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") return;
            try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) yield content;
            } catch {
                // skip malformed chunks
            }
        }
    }
}
