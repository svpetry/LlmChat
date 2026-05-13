import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import {
    AppBar,
    Box,
    Button,
    Collapse,
    Container,
    IconButton,
    LinearProgress,
    Paper,
    TextField,
    Toolbar,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LogoutIcon from "@mui/icons-material/Logout";
import SendIcon from "@mui/icons-material/Send";
import SettingsIcon from "@mui/icons-material/Settings";
import StopIcon from "@mui/icons-material/Stop";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
    connectionAtom,
    defaultConnection,
    fileAccessSettingsAtom,
    type FileAccessSettings,
    memorySettingsAtom,
    type MemorySettings,
    type MessageStats,
    type SearchSettings,
    type ToolCall,
    type ToolResult,
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

function canUseTools(
    searchSettings: SearchSettings,
    fileAccessSettings: FileAccessSettings,
    memorySettings: MemorySettings,
) {
    return (
        searchSettings.enabled ||
        fileAccessSettings.enabled ||
        memorySettings.enabled
    );
}

function getToolDisplay(toolCall: ToolCall) {
    let args: Record<string, unknown> = {};
    try {
        args = JSON.parse(toolCall.arguments) as Record<string, unknown>;
    } catch {
        // ignore invalid tool arguments in historical messages
    }

    if (toolCall.name === "web_search") {
        return {
            label: "Search",
            detail: typeof args.query === "string" ? args.query : "",
        };
    }

    if (toolCall.name === "read_website") {
        return {
            label: "Read website",
            detail: typeof args.url === "string" ? args.url : "",
        };
    }

    if (toolCall.name === "save_memory") {
        return {
            label: "Save memory",
            detail: typeof args.content === "string" ? args.content : "",
        };
    }

    if (toolCall.name === "search_memory") {
        return {
            label: "Search memory",
            detail: typeof args.query === "string" ? args.query : "",
        };
    }

    if (toolCall.name === "list_memories") {
        return { label: "List memories", detail: "" };
    }

    if (toolCall.name === "update_memory") {
        return {
            label: "Update memory",
            detail: typeof args.content === "string" ? args.content : "",
        };
    }

    if (toolCall.name === "delete_memory") {
        return {
            label: "Delete memory",
            detail: typeof args.id === "string" ? args.id : "",
        };
    }

    if (toolCall.name === "clear_memories") {
        return { label: "Clear memories", detail: "" };
    }

    const fileToolLabels: Record<string, string> = {
        list_home_directory: "List files",
        get_home_path_info: "Inspect path",
        search_home_paths: "Search files",
        read_home_file: "Read file",
        search_home_file_text: "Search file text",
        edit_home_file_lines: "Edit file",
        create_home_path: "Create path",
        delete_home_path: "Delete path",
    };

    if (toolCall.name in fileToolLabels) {
        const detail =
            typeof args.path === "string"
                ? args.path
                : typeof args.query === "string"
                  ? args.query
                  : "";
        return { label: fileToolLabels[toolCall.name], detail };
    }

    return { label: toolCall.name, detail: toolCall.arguments };
}

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
        setMessages(updatedMessages);
        setInput("");
        setStreaming(true);

        // Persist user message
        saveMessage(activeChatId, { id: userMsgId, ...userMessage }).catch(
            () => {},
        );

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
                const currentChat = chatList.find((c) => c.id === activeChatId);
                if (
                    currentChat?.title === "New Chat" &&
                    updatedMessages.length === 1
                ) {
                    const chatId = activeChatId;
                    generateChatTitle(chatId)
                        .then(({ title }) => {
                            setChatList((prev) =>
                                prev.map((c) =>
                                    c.id === chatId ? { ...c, title } : c,
                                ),
                            );
                        })
                        .catch(() => {});
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
                            <Box
                                key={i}
                                sx={{
                                    display: "flex",
                                    justifyContent:
                                        msg.role === "user"
                                            ? "flex-end"
                                            : "flex-start",
                                    mb: 2,
                                }}
                            >
                                <Paper
                                    sx={{
                                        px: 2,
                                        pt: 0.5,
                                        pb: 1,
                                        width: "80%",
                                        bgcolor:
                                            msg.role === "user"
                                                ? "primary.main"
                                                : "grey.800",
                                        wordBreak: "break-word",
                                    }}
                                >
                                    {msg.role === "assistant" ? (
                                        <>
                                            {msg.toolResults &&
                                                msg.toolResults.length > 0 && (
                                                    <Box sx={{ mb: 1 }}>
                                                        <Box
                                                            onClick={() =>
                                                                setExpandedTools(
                                                                    (prev) => {
                                                                        const next =
                                                                            new Set(
                                                                                prev,
                                                                            );
                                                                        if (
                                                                            next.has(
                                                                                i,
                                                                            )
                                                                        ) {
                                                                            next.delete(
                                                                                i,
                                                                            );
                                                                        } else {
                                                                            next.add(
                                                                                i,
                                                                            );
                                                                        }
                                                                        return next;
                                                                    },
                                                                )
                                                            }
                                                            sx={{
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                gap: 0.5,
                                                                cursor: "pointer",
                                                                userSelect:
                                                                    "none",
                                                                color: "grey.400",
                                                                fontSize:
                                                                    "0.8em",
                                                                "&:hover": {
                                                                    color: "grey.300",
                                                                },
                                                            }}
                                                        >
                                                            <ExpandMoreIcon
                                                                sx={{
                                                                    fontSize:
                                                                        "1em",
                                                                    transition:
                                                                        "transform 0.2s",
                                                                    transform:
                                                                        expandedTools.has(
                                                                            i,
                                                                        )
                                                                            ? "rotate(180deg)"
                                                                            : "rotate(0deg)",
                                                                }}
                                                            />
                                                            {
                                                                msg.toolResults
                                                                    .length
                                                            }{" "}
                                                            tool use
                                                            {msg.toolResults
                                                                .length > 1
                                                                ? "s"
                                                                : ""}
                                                        </Box>
                                                        <Collapse
                                                            in={expandedTools.has(
                                                                i,
                                                            )}
                                                        >
                                                            <Box
                                                                sx={{
                                                                    mt: 0.5,
                                                                    p: 1,
                                                                    borderRadius: 1,
                                                                    bgcolor:
                                                                        "grey.900",
                                                                    borderLeft: 2,
                                                                    borderColor:
                                                                        "grey.700",
                                                                    fontSize:
                                                                        "0.85em",
                                                                    color: "grey.400",
                                                                    maxHeight: 200,
                                                                    overflow:
                                                                        "auto",
                                                                }}
                                                            >
                                                                {msg.toolCalls?.map(
                                                                    (tc, j) => {
                                                                        const toolDisplay =
                                                                            getToolDisplay(
                                                                                tc,
                                                                            );
                                                                        return (
                                                                            <Box
                                                                                key={
                                                                                    tc.id
                                                                                }
                                                                                sx={
                                                                                    j >
                                                                                    0
                                                                                        ? {
                                                                                              mt: 1,
                                                                                              pt: 1,
                                                                                              borderTop: 1,
                                                                                              borderColor:
                                                                                                  "grey.800",
                                                                                          }
                                                                                        : {}
                                                                                }
                                                                            >
                                                                                <Typography
                                                                                    variant="caption"
                                                                                    sx={{
                                                                                        color: "grey.500",
                                                                                    }}
                                                                                >
                                                                                    {
                                                                                        toolDisplay.label
                                                                                    }
                                                                                    {toolDisplay.detail
                                                                                        ? `: ${toolDisplay.detail}`
                                                                                        : ""}
                                                                                </Typography>
                                                                                <Typography
                                                                                    variant="body2"
                                                                                    sx={{
                                                                                        whiteSpace:
                                                                                            "pre-wrap",
                                                                                    }}
                                                                                >
                                                                                    {
                                                                                        msg
                                                                                            .toolResults?.[
                                                                                            j
                                                                                        ]
                                                                                            ?.content
                                                                                    }
                                                                                </Typography>
                                                                            </Box>
                                                                        );
                                                                    },
                                                                )}
                                                            </Box>
                                                        </Collapse>
                                                    </Box>
                                                )}
                                            {msg.thinking && (
                                                <Box
                                                    sx={{
                                                        mb: 1,
                                                        width: "100%",
                                                    }}
                                                >
                                                    <Box
                                                        onClick={() =>
                                                            setExpandedThinking(
                                                                (prev) => {
                                                                    const next =
                                                                        new Set(
                                                                            prev,
                                                                        );
                                                                    if (
                                                                        next.has(
                                                                            i,
                                                                        )
                                                                    ) {
                                                                        next.delete(
                                                                            i,
                                                                        );
                                                                    } else {
                                                                        next.add(
                                                                            i,
                                                                        );
                                                                    }
                                                                    return next;
                                                                },
                                                            )
                                                        }
                                                        sx={{
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            gap: 0.5,
                                                            cursor: "pointer",
                                                            userSelect: "none",
                                                            color: "grey.400",
                                                            fontSize: "0.8em",
                                                            "&:hover": {
                                                                color: "grey.300",
                                                            },
                                                        }}
                                                    >
                                                        <ExpandMoreIcon
                                                            sx={{
                                                                fontSize: "1em",
                                                                transition:
                                                                    "transform 0.2s",
                                                                transform:
                                                                    expandedThinking.has(
                                                                        i,
                                                                    )
                                                                        ? "rotate(180deg)"
                                                                        : "rotate(0deg)",
                                                            }}
                                                        />
                                                        Thinking...
                                                    </Box>
                                                    <Collapse
                                                        in={expandedThinking.has(
                                                            i,
                                                        )}
                                                        sx={{
                                                            width: "100%",
                                                            minWidth: 0,
                                                            "& .MuiCollapse-wrapper":
                                                                {
                                                                    display:
                                                                        "block",
                                                                    width: "100%",
                                                                    minWidth: 0,
                                                                },
                                                            "& .MuiCollapse-wrapperInner":
                                                                {
                                                                    width: "100%",
                                                                    minWidth: 0,
                                                                },
                                                        }}
                                                    >
                                                        <Box
                                                            sx={{
                                                                boxSizing:
                                                                    "border-box",
                                                                width: "100%",
                                                                minWidth: 0,
                                                                mt: 0.5,
                                                                p: 1,
                                                                borderRadius: 1,
                                                                bgcolor:
                                                                    "grey.900",
                                                                borderLeft: 2,
                                                                borderColor:
                                                                    "grey.700",
                                                                fontSize:
                                                                    "0.85em",
                                                                color: "grey.400",
                                                                maxHeight: 300,
                                                                overflow:
                                                                    "auto",
                                                                "& p": {
                                                                    mt: 0,
                                                                    mb: 0.5,
                                                                },
                                                                "& ul, & ol": {
                                                                    mt: 0,
                                                                    mb: 0.5,
                                                                    pl: 2,
                                                                },
                                                                "& pre": {
                                                                    bgcolor:
                                                                        "grey.950",
                                                                    p: 1,
                                                                    borderRadius: 1,
                                                                    overflow:
                                                                        "auto",
                                                                    fontSize:
                                                                        "0.9em",
                                                                },
                                                                "& code": {
                                                                    fontFamily:
                                                                        "monospace",
                                                                    fontSize:
                                                                        "0.9em",
                                                                },
                                                                "& :not(pre) > code":
                                                                    {
                                                                        bgcolor:
                                                                            "grey.950",
                                                                        px: 0.5,
                                                                        borderRadius: 0.5,
                                                                    },
                                                            }}
                                                        >
                                                            <ReactMarkdown
                                                                remarkPlugins={[
                                                                    remarkGfm,
                                                                    remarkMath,
                                                                ]}
                                                                rehypePlugins={[
                                                                    rehypeKatex,
                                                                ]}
                                                            >
                                                                {msg.thinking}
                                                            </ReactMarkdown>
                                                        </Box>
                                                    </Collapse>
                                                </Box>
                                            )}
                                            <Box
                                                className="markdown-body"
                                                sx={{
                                                    "& p": { mt: 0, mb: 1 },
                                                    "& ul, & ol": {
                                                        mt: 0,
                                                        mb: 1,
                                                        pl: 2,
                                                    },
                                                    "& li": { mb: 0.25 },
                                                    "& h1, & h2, & h3, & h4, & h5, & h6":
                                                        {
                                                            mt: 1,
                                                            mb: 0.5,
                                                        },
                                                    "& pre": {
                                                        bgcolor: "grey.900",
                                                        p: 1.5,
                                                        borderRadius: 1,
                                                        overflow: "auto",
                                                        fontSize: "0.85em",
                                                    },
                                                    "& code": {
                                                        fontFamily: "monospace",
                                                        fontSize: "0.9em",
                                                    },
                                                    "& :not(pre) > code": {
                                                        bgcolor: "grey.900",
                                                        px: 0.5,
                                                        borderRadius: 0.5,
                                                    },
                                                    "& blockquote": {
                                                        borderLeft: 3,
                                                        borderColor: "grey.600",
                                                        pl: 2,
                                                        ml: 0,
                                                    },
                                                    "& table": {
                                                        borderCollapse:
                                                            "collapse",
                                                        width: "100%",
                                                    },
                                                    "& th, & td": {
                                                        border: 1,
                                                        borderColor: "grey.700",
                                                        px: 1,
                                                        py: 0.5,
                                                    },
                                                    "& hr": {
                                                        borderColor: "grey.700",
                                                    },
                                                }}
                                            >
                                                <ReactMarkdown
                                                    remarkPlugins={[
                                                        remarkGfm,
                                                        remarkMath,
                                                    ]}
                                                    rehypePlugins={[
                                                        rehypeKatex,
                                                    ]}
                                                >
                                                    {msg.content || "..."}
                                                </ReactMarkdown>
                                            </Box>
                                        </>
                                    ) : (
                                        <Typography
                                            variant="body1"
                                            sx={{ whiteSpace: "pre-wrap" }}
                                        >
                                            {msg.content}
                                        </Typography>
                                    )}
                                    {msg.stats && (
                                        <Typography
                                            variant="caption"
                                            sx={{
                                                color: "grey.500",
                                                mt: 0.5,
                                                display: "block",
                                            }}
                                        >
                                            PP:{" "}
                                            {msg.stats.ppTime >= 1000
                                                ? `${(msg.stats.ppTime / 1000).toFixed(1)}s`
                                                : `${msg.stats.ppTime}ms`}
                                            {" · "}
                                            {msg.stats.tokensPerSec} tok/s
                                            {" · "}
                                            {msg.stats.tokenCount} tokens
                                        </Typography>
                                    )}
                                </Paper>
                            </Box>
                        ))}
                        <div ref={messagesEndRef} />
                    </Container>
                </Box>

                <Container maxWidth="md" sx={{ py: 2 }}>
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
