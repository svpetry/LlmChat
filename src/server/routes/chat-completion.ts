import { Router } from "express";
import { getSetting } from "../database.js";
import {
    fetchWebsiteContent,
    readWebsiteTool,
    searchBrave,
    searchSearxng,
    webSearchTool,
    type SearchResult,
} from "../search.js";
import { executeCommandTool, executeTools } from "../execute.js";
import { executeHomeFileTool, homeFileTools } from "../fileAccess.js";
import { executeMemoryTool, memoryTools } from "../memory.js";

export const chatCompletionRouter = Router();

const MAX_TOOL_ITERATIONS = 5;
const CURRENT_DATE_TIME_SYSTEM_PROMPT_PREFIX = "Current date and time:";
const MEMORY_SYSTEM_PROMPT =
    "Memory is enabled. You have durable memory tools backed by the app database. Use save_memory when the user explicitly asks you to remember, save, or keep a fact or preference for later. Use search_memory when remembered facts or preferences may help answer the user's request. Use list_memories when the user asks what you remember. Use update_memory or delete_memory when the user corrects, changes, or asks you to forget a remembered fact; search or list first if you need the memory id. Use clear_memories only when the user clearly asks to clear all memories. Do not claim you remembered, updated, or forgot something unless the relevant memory tool succeeded.";
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

type ChatTool =
    | typeof webSearchTool
    | typeof readWebsiteTool
    | (typeof homeFileTools)[number]
    | (typeof memoryTools)[number]
    | (typeof executeTools)[number];

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

function formatCurrentDateTime(date = new Date()): string {
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
    }).format(date);
}

function addSystemPrompts<T>(messages: T[], includeMemoryPrompt: boolean): T[] {
    const systemMessages = [
        {
            role: "system",
            content: `${CURRENT_DATE_TIME_SYSTEM_PROMPT_PREFIX} ${formatCurrentDateTime()}.`,
        } as T,
    ];

    if (includeMemoryPrompt) {
        systemMessages.push({
            role: "system",
            content: MEMORY_SYSTEM_PROMPT,
        } as T);
    }

    return [...systemMessages, ...messages];
}

async function executeSearch(
    toolCall: OpenAIToolCall,
): Promise<{
    summary: string;
    content: string;
    image?: {
        path: string;
        name: string;
        mimeType: string;
        bytes: number;
        dataUrl: string;
    };
}> {
    let args: { query?: string };
    try {
        args = JSON.parse(toolCall.function.arguments);
    } catch {
        throw new Error("Invalid tool call arguments");
    }
    const query = args.query;
    if (!query) throw new Error("Missing query parameter");

    const directUrl = parseDirectHttpUrl(query);
    if (directUrl) {
        return readWebsiteUrl(directUrl);
    }

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

    return {
        summary: results.map((r) => r.title).join(", "),
        content,
    };
}

function parseDirectHttpUrl(input: string) {
    const trimmed = input.trim();
    if (!/^https?:\/\//i.test(trimmed)) return undefined;

    try {
        const url = new URL(trimmed);
        return url.href;
    } catch {
        return undefined;
    }
}

async function readWebsiteUrl(url: string): Promise<{
    summary: string;
    content: string;
    image?: {
        path: string;
        name: string;
        mimeType: string;
        bytes: number;
        dataUrl: string;
    };
}> {
    const page = await fetchWebsiteContent(url);
    if (page.image) {
        const content = [
            `Title: ${page.title}`,
            `URL: ${page.url}`,
            page.truncated ? "Image metadata (truncated):" : "Image metadata:",
            page.content,
        ].join("\n");
        return {
            summary: `Fetched image ${page.image.name} (${page.url})${
                page.truncated ? " (truncated)" : ""
            }`,
            content,
            image: {
                path: page.url,
                name: page.image.name,
                mimeType: page.image.mimeType,
                bytes: page.image.bytes,
                dataUrl: page.image.dataUrl,
            },
        };
    }

    const content = [
        `Title: ${page.title}`,
        `URL: ${page.url}`,
        page.truncated ? "Content (truncated):" : "Content:",
        page.content,
    ].join("\n");
    const summary = `Read ${page.title} (${page.url})${
        page.truncated ? " (truncated)" : ""
    }`;

    return { summary, content };
}

async function executeReadWebsite(toolCall: OpenAIToolCall) {
    let args: { url?: string };
    try {
        args = JSON.parse(toolCall.function.arguments);
    } catch {
        throw new Error("Invalid tool call arguments");
    }
    const url = args.url;
    if (!url) throw new Error("Missing url parameter");

    return readWebsiteUrl(url);
}

async function executeToolCall(toolCall: OpenAIToolCall): Promise<{
    summary: string;
    content: string;
    image?: {
        path: string;
        name: string;
        mimeType: string;
        bytes: number;
        dataUrl: string;
    };
}> {
    if (toolCall.function.name === "web_search") {
        return executeSearch(toolCall);
    }

    if (toolCall.function.name === "read_website") {
        return executeReadWebsite(toolCall);
    }

    if (
        homeFileTools.some(
            (tool) => tool.function.name === toolCall.function.name,
        )
    ) {
        if (getSetting("homeFileAccessEnabled") !== "true") {
            throw new Error("Home directory file access is disabled");
        }
        return executeHomeFileTool(
            toolCall.function.name,
            toolCall.function.arguments,
        );
    }

    if (
        memoryTools.some(
            (tool) => tool.function.name === toolCall.function.name,
        )
    ) {
        if (getSetting("memoryEnabled") !== "true") {
            throw new Error("Memory is disabled");
        }
        return executeMemoryTool(
            toolCall.function.name,
            toolCall.function.arguments,
        );
    }

    if (
        executeTools.some(
            (tool) => tool.function.name === toolCall.function.name,
        )
    ) {
        if (getSetting("executeEnabled") !== "true") {
            throw new Error("Command execution is disabled");
        }
        return executeCommandTool(
            toolCall.function.name,
            toolCall.function.arguments,
        );
    }

    throw new Error(`Unknown tool: ${toolCall.function.name}`);
}

async function streamWithTools(
    baseUrl: string,
    apiKey: string,
    model: string,
    openaiMessages: ReturnType<typeof toOpenAIMessages>,
    tools: ChatTool[],
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
        const toolMessages: {
            role: string;
            tool_call_id: string;
            content: string;
        }[] = [];
        for (const tc of toolCallsArray) {
            try {
                const { summary, content, image } = await executeToolCall(tc);
                toolMessages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    content,
                });
                res.write(
                    `event: tool_result\ndata: ${JSON.stringify({
                        toolCallId: tc.id,
                        content: summary,
                        image,
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

// --- Chat endpoint ---

chatCompletionRouter.post("/api/chat", async (req, res) => {
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
    const memoryEnabled = getSetting("memoryEnabled") === "true";
    const searchProvider = getSetting("searchProvider") ?? "brave";
    const hasSearchCredentials =
        searchProvider === "searxng"
            ? !!getSetting("searxngUrl")
            : !!getSetting("searchApiKey");

    const tools: ChatTool[] = [];
    if (toolsEnabled && searchEnabled) {
        if (hasSearchCredentials) {
            tools.push(webSearchTool);
        }
        tools.push(readWebsiteTool);
    }
    if (toolsEnabled && getSetting("homeFileAccessEnabled") === "true") {
        tools.push(...homeFileTools);
    }
    if (toolsEnabled && memoryEnabled) {
        tools.push(...memoryTools);
    }
    if (toolsEnabled && getSetting("executeEnabled") === "true") {
        tools.push(...executeTools);
    }
    const useTools = tools.length > 0;

    try {
        const openaiMessages = addSystemPrompts(
            toOpenAIMessages(messages),
            !!toolsEnabled && memoryEnabled,
        );

        if (useTools) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            await streamWithTools(
                baseUrl,
                apiKey,
                model,
                openaiMessages,
                tools,
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
