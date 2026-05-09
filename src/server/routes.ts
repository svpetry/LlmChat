import { Router } from "express";
import { getSetting, setSetting, getAllSettings } from "./database.js";
import {
    searchBrave,
    searchSearxng,
    webSearchTool,
    type SearchResult,
} from "./search.js";

export const router = Router();

router.get("/api/settings", (_req, res) => {
    const settings = getAllSettings();
    res.json({
        baseUrl: settings.baseUrl ?? "",
        apiKey: settings.apiKey ?? "",
        selectedModel: settings.selectedModel ?? "",
    });
});

router.post("/api/settings", (req, res) => {
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

router.post("/api/models", async (_req, res) => {
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

// --- Search settings ---

router.get("/api/search-settings", (_req, res) => {
    const settings = getAllSettings();
    res.json({
        enabled: settings.searchEnabled === "true",
        provider: settings.searchProvider ?? "brave",
        apiKeySet: !!settings.searchApiKey,
        searxngUrlSet: !!settings.searxngUrl,
    });
});

router.post("/api/search-settings", (req, res) => {
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

// --- Chat with tool call loop ---

const MAX_TOOL_ITERATIONS = 5;
const CHANNEL_LABELS = ["analysis", "commentary", "final", "thought"];
const CONTROL_TOKEN_NAMES = [
    "call",
    "channel",
    "constrain",
    "end",
    "message",
    "recipient",
    "return",
    "start",
] as const;
const CONTROL_TOKEN_AT_START = new RegExp(
    `^<\\|?(${CONTROL_TOKEN_NAMES.join("|")})\\|?>`,
    "i",
);
const CONTROL_TOKEN_PREFIXES = CONTROL_TOKEN_NAMES.flatMap((name) => [
    `<|${name}|>`,
    `<|${name}>`,
    `<${name}|>`,
]);
const CHANNEL_LABEL_AT_START = new RegExp(
    `^(${CHANNEL_LABELS.join("|")})\\b\\s*`,
    "i",
);

interface OpenAIToolCall {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
}

class LeadingChannelMarkupSanitizer {
    private buffer = "";
    private released = false;

    sanitize(chunk: string): string {
        if (this.released) {
            return chunk;
        }

        this.buffer += chunk;
        const stripped = stripLeadingChannelMarkup(this.buffer);
        if (stripped.pending && this.buffer.length < 256) {
            return "";
        }

        this.released = true;
        this.buffer = "";
        return stripped.text;
    }

    flush(): string {
        if (this.released || !this.buffer) {
            return "";
        }

        const stripped = stripLeadingChannelMarkup(this.buffer);
        this.released = true;
        this.buffer = "";
        return stripped.text;
    }
}

function stripLeadingChannelMarkup(input: string): {
    text: string;
    pending: boolean;
} {
    let text = input;
    let stripped = false;
    let pending = false;

    while (true) {
        const leadingWhitespace = text.match(/^\s*/)?.[0] ?? "";
        const candidate = text.slice(leadingWhitespace.length);

        if (isPartialControlToken(candidate)) {
            pending = true;
            break;
        }

        const tokenMatch = candidate.match(CONTROL_TOKEN_AT_START);
        if (!tokenMatch) {
            break;
        }

        stripped = true;
        const tokenName = tokenMatch[1].toLowerCase();
        text = candidate.slice(tokenMatch[0].length);

        if (tokenName === "channel") {
            const labelWhitespace = text.match(/^\s*/)?.[0] ?? "";
            const labelCandidate = text.slice(labelWhitespace.length);
            const labelMatch = labelCandidate.match(CHANNEL_LABEL_AT_START);

            if (labelMatch) {
                text = labelCandidate.slice(labelMatch[0].length);
                if (!text || isPartialControlToken(text)) {
                    pending = true;
                    break;
                }
            } else if (
                !labelCandidate ||
                isPartialChannelLabel(labelCandidate)
            ) {
                pending = true;
                break;
            }
        } else if (tokenName === "start") {
            text = text.replace(/^\s*(assistant|tool)\b\s*/i, "");
        }
    }

    return {
        text: stripped ? text.replace(/^\s+/, "") : input,
        pending,
    };
}

function isPartialControlToken(text: string): boolean {
    if (!text) {
        return false;
    }

    const lower = text.toLowerCase();
    return CONTROL_TOKEN_PREFIXES.some(
        (prefix) => prefix.startsWith(lower) && prefix !== lower,
    );
}

function isPartialChannelLabel(text: string): boolean {
    if (!text || /\s/.test(text)) {
        return false;
    }

    const lower = text.toLowerCase();
    return CHANNEL_LABELS.some(
        (label) => label.startsWith(lower) && label !== lower,
    );
}

function toOpenAIMessages(
    messages: {
        role: string;
        content: string;
        toolCalls?: { id: string; name: string; arguments: string }[];
    }[],
) {
    return messages.map((m) => {
        if (m.role === "assistant" && m.toolCalls?.length) {
            return {
                role: "assistant",
                content: m.content || null,
                tool_calls: m.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: "function" as const,
                    function: { name: tc.name, arguments: tc.arguments },
                })),
            };
        }
        return { role: m.role, content: m.content };
    });
}

async function executeSearch(
    toolCall: OpenAIToolCall,
): Promise<{ results: SearchResult[]; content: string }> {
    let args: { query?: string };
    try {
        args = JSON.parse(toolCall.function.arguments);
    } catch {
        throw new Error("Invalid tool call arguments");
    }
    const query = args.query;
    if (!query) throw new Error("Missing query parameter");

    const provider = getSetting("searchProvider") ?? "brave";
    let results: SearchResult[];

    if (provider === "searxng") {
        const url = getSetting("searxngUrl");
        if (!url) throw new Error("SearXNG URL not configured");
        results = await searchSearxng(query, url);
    } else {
        const apiKey = getSetting("searchApiKey");
        if (!apiKey) throw new Error("Search API key not configured");
        results = await searchBrave(query, apiKey);
    }

    const content = results
        .map((r) => `[${r.title}](${r.url})\n${r.snippet}`)
        .join("\n\n");

    return { results, content };
}

async function streamWithTools(
    baseUrl: string,
    apiKey: string,
    model: string,
    openaiMessages: ReturnType<typeof toOpenAIMessages>,
    tools: typeof webSearchTool[],
    res: import("express").Response,
    signal?: AbortSignal,
    iteration = 0,
): Promise<void> {
    const body: Record<string, unknown> = {
        model,
        messages: openaiMessages,
        stream: true,
    };
    if (tools.length > 0) {
        body.tools = tools;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        const text = await response.text();
        res.write(
            `data: ${JSON.stringify({ error: `API error: ${text}` })}\n\n`,
        );
        return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const contentSanitizer = new LeadingChannelMarkupSanitizer();

    // Track tool calls and finish reason for tool loop
    const toolCalls: Map<number, OpenAIToolCall> = new Map();
    let finishReason: string | null = null;
    let forwardedChunks = false;
    let toolCallsDetected = false;

    try {
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
                if (data === "[DONE]") continue;

                try {
                    const parsed = JSON.parse(data);
                    const choice = parsed.choices?.[0];
                    if (!choice) continue;

                    // Track finish reason
                    if (choice.finish_reason) {
                        finishReason = choice.finish_reason;
                    }

                    // Accumulate tool call deltas
                    if (choice.delta?.tool_calls) {
                        toolCallsDetected = true;
                        for (const tc of choice.delta.tool_calls) {
                            const existing = toolCalls.get(tc.index) ?? {
                                id: tc.id ?? "",
                                type: "function" as const,
                                function: { name: "", arguments: "" },
                            };
                            if (tc.id) existing.id = tc.id;
                            if (tc.function?.name)
                                existing.function.name += tc.function.name;
                            if (tc.function?.arguments)
                                existing.function.arguments +=
                                    tc.function.arguments;
                            toolCalls.set(tc.index, existing);
                        }
                    }

                    // Forward content/thinking only if no tool_calls detected yet
                    if (!toolCallsDetected) {
                        const delta = choice.delta;
                        if (
                            delta?.content ||
                            delta?.reasoning_content ||
                            delta?.thinking
                        ) {
                            if (typeof delta.content === "string") {
                                delta.content = contentSanitizer.sanitize(
                                    delta.content,
                                );
                            }
                            if (
                                delta.content ||
                                delta.reasoning_content ||
                                delta.thinking
                            ) {
                                res.write(
                                    `data: ${JSON.stringify(parsed)}\n\n`,
                                );
                            }
                            forwardedChunks = true;
                        }
                    }
                } catch {
                    // skip malformed chunks
                }
            }
        }
    } finally {
        // Don't end the response yet if we need to loop
    }

    const bufferedContent = contentSanitizer.flush();
    if (bufferedContent && finishReason !== "tool_calls") {
        res.write(
            `data: ${JSON.stringify({
                choices: [{ delta: { content: bufferedContent } }],
            })}\n\n`,
        );
    }

    // Handle tool calls
    if (
        finishReason === "tool_calls" &&
        toolCalls.size > 0 &&
        iteration < MAX_TOOL_ITERATIONS
    ) {
        const toolCallsArray = Array.from(toolCalls.values());

        // Tell client to discard any content forwarded before tool_calls were detected
        if (forwardedChunks) {
            res.write("event: clear_content\ndata: {}\n\n");
        }

        // Emit tool_call events to client
        for (const tc of toolCallsArray) {
            res.write(
                `event: tool_call\ndata: ${JSON.stringify({
                    id: tc.id,
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                })}\n\n`,
            );
        }

        // Execute each tool call and emit results
        const toolMessages: { role: string; tool_call_id: string; content: string }[] =
            [];
        for (const tc of toolCallsArray) {
            try {
                const { results, content } = await executeSearch(tc);
                toolMessages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content,
                });
                res.write(
                    `event: tool_result\ndata: ${JSON.stringify({
                        toolCallId: tc.id,
                        content: results
                            .map((r) => r.title)
                            .join(", "),
                    })}\n\n`,
                );
            } catch (err) {
                const errMsg = (err as Error).message;
                toolMessages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content: `Error: ${errMsg}`,
                });
                res.write(
                    `event: tool_result\ndata: ${JSON.stringify({
                        toolCallId: tc.id,
                        content: `Error: ${errMsg}`,
                    })}\n\n`,
                );
            }
        }

        // Build augmented message history for next iteration
        const assistantMsg = {
            role: "assistant",
            content: null,
            tool_calls: toolCallsArray,
        };
        const nextMessages = [...openaiMessages, assistantMsg, ...toolMessages];

        // Recurse for next iteration
        return streamWithTools(
            baseUrl,
            apiKey,
            model,
            nextMessages,
            tools,
            res,
            signal,
            iteration + 1,
        );
    }

    // Final response or max iterations reached - nothing more to do
    res.end();
}

router.post("/api/chat", async (req, res) => {
    const { messages, model, toolsEnabled } = req.body as {
        messages: {
            role: string;
            content: string;
            toolCalls?: { id: string; name: string; arguments: string }[];
        }[];
        model: string;
        toolsEnabled?: boolean;
    };
    const baseUrl = (getSetting("baseUrl") ?? "").replace(/\/+$/, "");
    const apiKey = getSetting("apiKey") ?? "";

    if (!baseUrl) {
        res.status(400).json({ error: "Base URL not configured" });
        return;
    }

    const searchEnabled = getSetting("searchEnabled") === "true";
    const searchProvider = getSetting("searchProvider") ?? "brave";
    const hasSearchCredentials =
        searchProvider === "searxng"
            ? !!getSetting("searxngUrl")
            : !!getSetting("searchApiKey");

    const useTools = toolsEnabled && searchEnabled && hasSearchCredentials;

    try {
        const openaiMessages = toOpenAIMessages(messages);

        if (useTools) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            await streamWithTools(
                baseUrl,
                apiKey,
                model,
                openaiMessages,
                [webSearchTool],
                res,
                (req as unknown as { signal?: AbortSignal }).signal,
            );
        } else {
            // Original passthrough streaming
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: openaiMessages,
                    stream: true,
                }),
                signal: (req as unknown as { signal?: AbortSignal }).signal,
            });

            if (!response.ok) {
                const text = await response.text();
                res.status(response.status).json({
                    error: `API error: ${text}`,
                });
                return;
            }

            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            const reader = response.body!.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(Buffer.from(value));
                }
            } finally {
                res.end();
            }
        }
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({
                error: `Chat failed: ${(err as Error).message}`,
            });
        } else {
            res.end();
        }
    }
});
