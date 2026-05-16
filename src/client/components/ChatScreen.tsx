import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import {
    AppBar,
    Box,
    Button,
    Container,
    IconButton,
    LinearProgress,
    TextField,
    Toolbar,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LogoutIcon from "@mui/icons-material/Logout";
import SendIcon from "@mui/icons-material/Send";
import SettingsIcon from "@mui/icons-material/Settings";
import StopIcon from "@mui/icons-material/Stop";
import {
    connectionAtom,
    defaultConnection,
    fileAccessSettingsAtom,
    type FileAccessSettings,
    memorySettingsAtom,
    type MemorySettings,
    type SearchSettings,
    type ToolCall,
    type ToolResult,
    type MessageStats,
    messagesAtom,
    searchSettingsAtom,
    streamingAtom,
    activeChatIdAtom,
    chatListAtom,
} from "../atoms.js";
import {
    fetchFileAccessSettings,
    fetchMemorySettings,
    fetchSearchSettings,
    streamChat,
    fetchChats,
    createChatApi,
    deleteChatApi,
    fetchMessages,
    saveMessage,
    generateChatTitle,
} from "../api.js";
import ChatSettingsDialog from "./ChatSettingsDialog.js";
import ChatSidebar from "./ChatSidebar.js";
import MessageBox from "./MessageBox.js";
import { canUseTools } from "./chatUtils.js";

export default function ChatScreen() {
    const [connection, setConnection] = useAtom(connectionAtom);
    const [messages, setMessages] = useAtom(messagesAtom);
    const [streaming, setStreaming] = useAtom(streamingAtom);
    const [searchSettings, setSearchSettings] = useAtom(searchSettingsAtom);
    const [fileAccessSettings, setFileAccessSettings] = useAtom(
        fileAccessSettingsAtom,
    );
    const [memorySettings, setMemorySettings] = useAtom(memorySettingsAtom);
    const [activeChatId, setActiveChatId] = useAtom(activeChatIdAtom);
    const [chatList, setChatList] = useAtom(chatListAtom);
    const [searchSettingsLoaded, setSearchSettingsLoaded] = useState(false);
    const [input, setInput] = useState("");
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [expandedThinking, setExpandedThinking] = useState<Set<number>>(
        new Set(),
    );
    const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const focusInputAfterStreamRef = useRef(false);
    const searchSettingsPromiseRef = useRef<Promise<SearchSettings> | null>(
        null,
    );
    const fileAccessSettingsPromiseRef =
        useRef<Promise<FileAccessSettings> | null>(null);
    const memorySettingsPromiseRef = useRef<Promise<MemorySettings> | null>(
        null,
    );
    const initializedRef = useRef(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const focusInput = useCallback(() => {
        requestAnimationFrame(() => {
            inputRef.current?.focus({ preventScroll: true });
        });
    }, []);

    // Load search settings
    useEffect(() => {
        let cancelled = false;
        const searchLoad =
            searchSettingsPromiseRef.current ?? fetchSearchSettings();
        const fileAccessLoad =
            fileAccessSettingsPromiseRef.current ?? fetchFileAccessSettings();
        const memoryLoad =
            memorySettingsPromiseRef.current ?? fetchMemorySettings();
        searchSettingsPromiseRef.current = searchLoad;
        fileAccessSettingsPromiseRef.current = fileAccessLoad;
        memorySettingsPromiseRef.current = memoryLoad;

        Promise.all([searchLoad, fileAccessLoad, memoryLoad])
            .then(([settings, fileSettings, memory]) => {
                if (cancelled) return;
                setSearchSettings(settings);
                setFileAccessSettings(fileSettings);
                setMemorySettings(memory);
            })
            .catch(() => {
                // Leave tools disabled if settings cannot be loaded.
            })
            .finally(() => {
                if (cancelled) return;
                setSearchSettingsLoaded(true);
                searchSettingsPromiseRef.current = null;
                fileAccessSettingsPromiseRef.current = null;
                memorySettingsPromiseRef.current = null;
            });

        return () => {
            cancelled = true;
        };
    }, [setFileAccessSettings, setMemorySettings, setSearchSettings]);

    // Load chat list and initialize on mount
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const cancelled = false;
        (async () => {
            try {
                const chats = await fetchChats();
                if (cancelled) return;
                setChatList(chats);
                if (chats.length > 0) {
                    setActiveChatId(chats[0].id);
                    const msgs = await fetchMessages(chats[0].id);
                    if (cancelled) return;
                    setMessages(msgs);
                } else {
                    await handleNewChat();
                }
            } catch {
                // If loading fails, start fresh
                if (!cancelled) await handleNewChat();
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleNewChat = async () => {
        const id = crypto.randomUUID();
        const chat = await createChatApi(id, connection.selectedModel);
        setChatList((prev) => [chat, ...prev]);
        setActiveChatId(id);
        setMessages([]);
        focusInputAfterStreamRef.current = true;
    };

    const handleSelectChat = async (chatId: string) => {
        if (chatId === activeChatId) return;
        if (streaming) {
            abortRef.current?.abort();
        }
        setActiveChatId(chatId);
        const msgs = await fetchMessages(chatId);
        setMessages(msgs);
        setExpandedThinking(new Set());
        setExpandedTools(new Set());
    };

    const handleDeleteChat = async (chatId: string) => {
        await deleteChatApi(chatId);
        setChatList((prev) => {
            const updated = prev.filter((c) => c.id !== chatId);
            if (chatId === activeChatId) {
                if (updated.length > 0) {
                    const nextChat = updated[0];
                    setActiveChatId(nextChat.id);
                    fetchMessages(nextChat.id).then(setMessages);
                } else {
                    handleNewChat();
                }
            }
            return updated;
        });
    };

    const handleSend = async () => {
        const text = input.trim();
        if (!text || streaming || !activeChatId) return;

        focusInputAfterStreamRef.current = true;
        const userMsgId = crypto.randomUUID();
        const userMessage = { role: "user" as const, content: text };
        const updatedMessages = [...messages, userMessage];
        const currentChat = chatList.find((c) => c.id === activeChatId);
        const shouldGenerateTitle =
            currentChat?.title === "New Chat" &&
            !messages.some((m) => m.role === "user");
        setMessages(updatedMessages);
        setInput("");
        setStreaming(true);

        // Persist user message
        const userSave = saveMessage(activeChatId, {
            id: userMsgId,
            ...userMessage,
        }).catch((err) => {
            console.warn("Failed to save user message", err);
        });

        let assistantContent = "";
        let thinkingContent = "";
        let toolCalls: ToolCall[] = [];
        let toolResults: ToolResult[] = [];
        const startTime = performance.now();
        let firstTokenTime = 0;
        let tokenCount = 0;

        let searchSettingsForSend = searchSettings;
        let fileAccessSettingsForSend = fileAccessSettings;
        let memorySettingsForSend = memorySettings;
        if (!searchSettingsLoaded) {
            try {
                const searchLoad =
                    searchSettingsPromiseRef.current ?? fetchSearchSettings();
                const fileAccessLoad =
                    fileAccessSettingsPromiseRef.current ??
                    fetchFileAccessSettings();
                const memoryLoad =
                    memorySettingsPromiseRef.current ?? fetchMemorySettings();
                searchSettingsPromiseRef.current = searchLoad;
                fileAccessSettingsPromiseRef.current = fileAccessLoad;
                memorySettingsPromiseRef.current = memoryLoad;
                [
                    searchSettingsForSend,
                    fileAccessSettingsForSend,
                    memorySettingsForSend,
                ] = await Promise.all([searchLoad, fileAccessLoad, memoryLoad]);
                setSearchSettings(searchSettingsForSend);
                setFileAccessSettings(fileAccessSettingsForSend);
                setMemorySettings(memorySettingsForSend);
                setSearchSettingsLoaded(true);
                searchSettingsPromiseRef.current = null;
                fileAccessSettingsPromiseRef.current = null;
                memorySettingsPromiseRef.current = null;
            } catch {
                setSearchSettingsLoaded(true);
                searchSettingsPromiseRef.current = null;
                fileAccessSettingsPromiseRef.current = null;
                memorySettingsPromiseRef.current = null;
            }
        }
        const toolsEnabled = canUseTools(
            searchSettingsForSend,
            fileAccessSettingsForSend,
            memorySettingsForSend,
        );

        const setAssistantMessage = (
            content: string,
            thinking: string | undefined,
            tCalls: ToolCall[],
            tResults: ToolResult[],
            stats?: MessageStats,
        ) => {
            setMessages([
                ...updatedMessages,
                {
                    role: "assistant" as const,
                    content,
                    thinking: thinking || undefined,
                    toolCalls: tCalls.length > 0 ? tCalls : undefined,
                    toolResults: tResults.length > 0 ? tResults : undefined,
                    stats,
                },
            ]);
        };

        setAssistantMessage("", undefined, [], []);

        const abortController = new AbortController();
        abortRef.current = abortController;

        try {
            for await (const chunk of streamChat(
                updatedMessages,
                connection.selectedModel,
                abortController.signal,
                toolsEnabled,
            )) {
                if (chunk.clearContent) {
                    assistantContent = "";
                    thinkingContent = "";
                    tokenCount = 0;
                    continue;
                }
                if (chunk.toolCall) {
                    assistantContent = "";
                    thinkingContent = "";
                    tokenCount = 0;
                    toolCalls = [
                        ...toolCalls,
                        {
                            id: chunk.toolCall.id,
                            name: chunk.toolCall.name,
                            arguments: chunk.toolCall.arguments,
                        },
                    ];
                    setAssistantMessage(
                        assistantContent,
                        thinkingContent,
                        toolCalls,
                        toolResults,
                    );
                    scrollToBottom();
                    continue;
                }
                if (chunk.toolResult) {
                    toolResults = [
                        ...toolResults,
                        {
                            toolCallId: chunk.toolResult.toolCallId,
                            content: chunk.toolResult.content,
                            image: chunk.toolResult.image,
                        },
                    ];
                    setAssistantMessage(
                        assistantContent,
                        thinkingContent,
                        toolCalls,
                        toolResults,
                    );
                    scrollToBottom();
                    continue;
                }
                tokenCount++;
                if (tokenCount === 1) {
                    firstTokenTime = performance.now();
                }
                if (chunk.content) {
                    const c =
                        tokenCount === 1
                            ? chunk.content.replace(/^\n+/, "")
                            : chunk.content;
                    assistantContent += c;
                }
                if (chunk.thinking) {
                    thinkingContent += chunk.thinking;
                }
                setAssistantMessage(
                    assistantContent,
                    thinkingContent,
                    toolCalls,
                    toolResults,
                );
                scrollToBottom();
            }
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                assistantContent += `\n\n**Error: ${(err as Error).message}**`;
                setAssistantMessage(
                    assistantContent,
                    thinkingContent,
                    toolCalls,
                    toolResults,
                );
            }
        } finally {
            abortRef.current = null;
            const endTime = performance.now();
            const ppTime = firstTokenTime ? firstTokenTime - startTime : 0;
            const genTime = firstTokenTime ? endTime - firstTokenTime : 0;
            const tokensPerSec =
                genTime > 0 ? (tokenCount * 1000) / genTime : 0;

            const finalStats = {
                ppTime: Math.round(ppTime),
                tokensPerSec: Math.round(tokensPerSec * 10) / 10,
                tokenCount,
            };

            setAssistantMessage(
                assistantContent,
                thinkingContent,
                toolCalls,
                toolResults,
                finalStats,
            );
            setStreaming(false);

            // Persist assistant message
            const assistantMsgId = crypto.randomUUID();
            const assistantMsg = {
                id: assistantMsgId,
                role: "assistant" as const,
                content: assistantContent,
                thinking: thinkingContent || undefined,
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                toolResults: toolResults.length > 0 ? toolResults : undefined,
                stats: finalStats,
            };
            if (activeChatId) {
                saveMessage(activeChatId, assistantMsg).catch(() => {});

                // Auto-generate title after first exchange
                if (shouldGenerateTitle) {
                    const chatId = activeChatId;
                    void (async () => {
                        try {
                            await userSave;
                            const { title } = await generateChatTitle(
                                chatId,
                                text,
                            );
                            setChatList((prev) =>
                                prev.map((c) =>
                                    c.id === chatId ? { ...c, title } : c,
                                ),
                            );
                        } catch (err) {
                            console.warn(
                                "Failed to generate chat title",
                                err,
                            );
                        }
                    })();
                }
            }
        }
    };

    useEffect(() => {
        if (!streaming && focusInputAfterStreamRef.current) {
            focusInputAfterStreamRef.current = false;
            focusInput();
        }
    }, [focusInput, streaming]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleDisconnect = () => {
        setMessages([]);
        setActiveChatId(null);
        setChatList([]);
        setConnection({ ...defaultConnection });
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "row", height: "100vh" }}>
            <ChatSidebar
                chats={chatList}
                activeChatId={activeChatId}
                onSelectChat={handleSelectChat}
                onNewChat={handleNewChat}
                onDeleteChat={handleDeleteChat}
            />

            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    flexGrow: 1,
                    minWidth: 0,
                }}
            >
                <AppBar position="static">
                    <Toolbar>
                        <Typography variant="h6" sx={{ flexGrow: 1 }}>
                            {connection.selectedModel}{" "}
                            <Typography
                                component="span"
                                variant="caption"
                                sx={{ opacity: 0.6 }}
                            >
                                v{__APP_VERSION__}
                            </Typography>
                        </Typography>
                        <IconButton
                            color="inherit"
                            onClick={handleNewChat}
                            title="New chat"
                        >
                            <AddIcon />
                        </IconButton>
                        <IconButton
                            color="inherit"
                            onClick={() => setSettingsOpen(true)}
                            title="Settings"
                        >
                            <SettingsIcon />
                        </IconButton>
                        <Button
                            color="inherit"
                            startIcon={<LogoutIcon />}
                            onClick={handleDisconnect}
                        >
                            Disconnect
                        </Button>
                    </Toolbar>
                </AppBar>

                <ChatSettingsDialog
                    open={settingsOpen}
                    onClose={() => setSettingsOpen(false)}
                />

                {streaming && <LinearProgress />}

                <Box sx={{ flexGrow: 1, overflow: "auto", py: 2 }}>
                    <Container maxWidth="md">
                        {messages.map((msg, i) => (
                            <MessageBox
                                key={i}
                                msg={msg}
                                index={i}
                                expandedThinking={expandedThinking}
                                expandedTools={expandedTools}
                                onToggleThinking={(idx) =>
                                    setExpandedThinking((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(idx)) next.delete(idx);
                                        else next.add(idx);
                                        return next;
                                    })
                                }
                                onToggleTools={(idx) =>
                                    setExpandedTools((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(idx)) next.delete(idx);
                                        else next.add(idx);
                                        return next;
                                    })
                                }
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </Container>
                </Box>

                <Container maxWidth="md" sx={{ pt: 2, pb: 0.5 }}>
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <TextField
                            fullWidth
                            multiline
                            maxRows={4}
                            placeholder="Type a message..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={streaming}
                            inputRef={inputRef}
                        />
                        {streaming ? (
                            <Button
                                variant="contained"
                                color="error"
                                onClick={() => abortRef.current?.abort()}
                                sx={{ minWidth: 48 }}
                            >
                                <StopIcon />
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                onClick={handleSend}
                                disabled={!input.trim()}
                                sx={{ minWidth: 48 }}
                            >
                                <SendIcon />
                            </Button>
                        )}
                    </Box>
                </Container>
            </Box>
        </Box>
    );
}
