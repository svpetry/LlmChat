import { atom } from "jotai";

export interface MessageStats {
    ppTime: number;
    tokensPerSec: number;
    tokenCount: number;
}

export interface Message {
    role: "user" | "assistant";
    content: string;
    thinking?: string;
    stats?: MessageStats;
}

export interface ConnectionState {
    baseUrl: string;
    apiKey: string;
    models: string[];
    selectedModel: string;
    connected: boolean;
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
