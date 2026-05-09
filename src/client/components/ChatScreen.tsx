import { useRef, useState } from "react";
import { useAtom } from "jotai";
import {
    AppBar,
    Box,
    Button,
    Container,
    IconButton,
    LinearProgress,
    Paper,
    TextField,
    Toolbar,
    Typography,
} from "@mui/material";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import LogoutIcon from "@mui/icons-material/Logout";
import SendIcon from "@mui/icons-material/Send";
import StopIcon from "@mui/icons-material/Stop";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    connectionAtom,
    defaultConnection,
    type MessageStats,
    messagesAtom,
    streamingAtom,
} from "../atoms.js";
import { streamChat } from "../api.js";

export default function ChatScreen() {
    const [connection, setConnection] = useAtom(connectionAtom);
    const [messages, setMessages] = useAtom(messagesAtom);
    const [streaming, setStreaming] = useAtom(streamingAtom);
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSend = async () => {
        const text = input.trim();
        if (!text || streaming) return;

        const userMessage = { role: "user" as const, content: text };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setInput("");
        setStreaming(true);

        let assistantContent = "";
        const startTime = performance.now();
        let firstTokenTime = 0;
        let tokenCount = 0;

        const setAssistantMessage = (
            content: string,
            stats?: MessageStats,
        ) => {
            setMessages([
                ...updatedMessages,
                { role: "assistant" as const, content, stats },
            ]);
        };

        setAssistantMessage("");

        const abortController = new AbortController();
        abortRef.current = abortController;

        try {
            for await (const chunk of streamChat(
                updatedMessages,
                connection.selectedModel,
                abortController.signal,
            )) {
                tokenCount++;
                if (tokenCount === 1) {
                    firstTokenTime = performance.now();
                }
                const c =
                    tokenCount === 1 ? chunk.replace(/^\n+/, "") : chunk;
                assistantContent += c;
                setAssistantMessage(assistantContent);
                scrollToBottom();
            }
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                assistantContent += `\n\n**Error: ${(err as Error).message}**`;
                setAssistantMessage(assistantContent);
            }
        } finally {
            abortRef.current = null;
            const endTime = performance.now();
            const ppTime = firstTokenTime
                ? firstTokenTime - startTime
                : 0;
            const genTime = firstTokenTime
                ? endTime - firstTokenTime
                : 0;
            const tokensPerSec = genTime > 0
                ? (tokenCount * 1000) / genTime
                : 0;

            setAssistantMessage(assistantContent, {
                ppTime: Math.round(ppTime),
                tokensPerSec: Math.round(tokensPerSec * 10) / 10,
                tokenCount,
            });
            setStreaming(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleClear = () => {
        setMessages([]);
    };

    const handleDisconnect = () => {
        setMessages([]);
        setConnection({ ...defaultConnection });
    };

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        {connection.selectedModel}
                    </Typography>
                    <IconButton
                        color="inherit"
                        onClick={handleClear}
                        title="Clear chat"
                    >
                        <DeleteSweepIcon />
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
                                    maxWidth: "80%",
                                    bgcolor:
                                        msg.role === "user"
                                            ? "primary.main"
                                            : "grey.800",
                                    wordBreak: "break-word",
                                }}
                            >
                                {msg.role === "assistant" ? (
                                    <Box
                                        className="markdown-body"
                                        sx={{
                                            "& p": { mt: 0, mb: 1 },
                                            "& ul, & ol": { mt: 0, mb: 1, pl: 2 },
                                            "& li": { mb: 0.25 },
                                            "& h1, & h2, & h3, & h4, & h5, & h6": {
                                                mt: 1, mb: 0.5,
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
                                                borderCollapse: "collapse",
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
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {msg.content || "..."}
                                        </ReactMarkdown>
                                    </Box>
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
    );
}
