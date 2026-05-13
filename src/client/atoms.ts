import { atom } from "jotai";

export interface MessageStats {
    ppTime: number;
    tokensPerSec: number;
    tokenCount: number;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: string;
}

export interface ToolResult {
    toolCallId: string;
    content: string;
}

export interface Message {
    role: "user" | "assistant" | "tool";
    content: string;
    thinking?: string;
    stats?: MessageStats;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
}

export interface ConnectionState {
    baseUrl: string;
    apiKey: string;
    models: string[];
    selectedModel: string;
    connected: boolean;
}

export interface SearchSettings {
    enabled: boolean;
    provider: "brave" | "searxng";
    apiKeySet: boolean;
    searxngUrlSet: boolean;
}

export interface FileAccessSettings {
    enabled: boolean;
}

export const defaultConnection: ConnectionState = {
    baseUrl: "",
    apiKey: "",
    models: [],
    selectedModel: "",
    connected: false,
};

export const connectionAtom = atom<ConnectionState>(defaultConnection);
export const messagesAtom = atom<Message[]>([]);
export const streamingAtom = atom(false);
export const searchSettingsAtom = atom<SearchSettings>({
    enabled: false,
    provider: "brave",
    apiKeySet: false,
    searxngUrlSet: false,
});
export const fileAccessSettingsAtom = atom<FileAccessSettings>({
    enabled: false,
});

export interface ChatSummary {
    id: string;
    title: string;
    model: string;
    createdAt: number;
    updatedAt: number;
}

export const activeChatIdAtom = atom<string | null>(null);
export const chatListAtom = atom<ChatSummary[]>([]);
