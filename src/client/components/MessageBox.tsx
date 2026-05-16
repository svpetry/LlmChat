import { Box, Collapse, Paper, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Message } from "../atoms.js";
import { getToolDisplay } from "./chatUtils.js";

interface MessageBoxProps {
    msg: Message;
    index: number;
    expandedThinking: Set<number>;
    expandedTools: Set<number>;
    onToggleThinking: (index: number) => void;
    onToggleTools: (index: number) => void;
}

export default function MessageBox({
    msg,
    index,
    expandedThinking,
    expandedTools,
    onToggleThinking,
    onToggleTools,
}: MessageBoxProps) {
    const toolResultsByCallId = new Map(
        msg.toolResults?.map((result) => [result.toolCallId, result]) ?? [],
    );

    return (
        <Box
            sx={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                mb: 2,
            }}
        >
            <Paper
                sx={{
                    px: 2,
                    pt: 0.5,
                    pb: 1,
                    width: "80%",
                    bgcolor: msg.role === "user" ? "primary.main" : "grey.800",
                    wordBreak: "break-word",
                }}
            >
                {msg.role === "assistant" ? (
                    <>
                        {msg.toolResults && msg.toolResults.length > 0 && (
                            <Box sx={{ mb: 1 }}>
                                <Box
                                    onClick={() => onToggleTools(index)}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
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
                                            transition: "transform 0.2s",
                                            transform: expandedTools.has(index)
                                                ? "rotate(180deg)"
                                                : "rotate(0deg)",
                                        }}
                                    />
                                    {msg.toolResults.length} tool use
                                    {msg.toolResults.length > 1 ? "s" : ""}
                                </Box>
                                <Collapse in={expandedTools.has(index)}>
                                    <Box
                                        sx={{
                                            mt: 0.5,
                                            p: 1,
                                            borderRadius: 1,
                                            bgcolor: "grey.900",
                                            borderLeft: 2,
                                            borderColor: "grey.700",
                                            fontSize: "0.85em",
                                            color: "grey.400",
                                            maxHeight: 200,
                                            overflow: "auto",
                                        }}
                                    >
                                        {msg.toolCalls?.map((tc, j) => {
                                            const toolDisplay =
                                                getToolDisplay(tc);
                                            const toolResult =
                                                toolResultsByCallId.get(tc.id);
                                            return (
                                                <Box
                                                    key={tc.id}
                                                    sx={
                                                        j > 0
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
                                                        {toolDisplay.label}
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
                                                        {toolResult?.content}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </Collapse>
                            </Box>
                        )}
                        {msg.thinking && (
                            <Box sx={{ mb: 1, width: "100%" }}>
                                <Box
                                    onClick={() => onToggleThinking(index)}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
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
                                            transition: "transform 0.2s",
                                            transform: expandedThinking.has(
                                                index,
                                            )
                                                ? "rotate(180deg)"
                                                : "rotate(0deg)",
                                        }}
                                    />
                                    Thinking...
                                </Box>
                                <Collapse
                                    in={expandedThinking.has(index)}
                                    sx={{
                                        width: "100%",
                                        minWidth: 0,
                                        "& .MuiCollapse-wrapper": {
                                            display: "block",
                                            width: "100%",
                                            minWidth: 0,
                                        },
                                        "& .MuiCollapse-wrapperInner": {
                                            width: "100%",
                                            minWidth: 0,
                                        },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            boxSizing: "border-box",
                                            width: "100%",
                                            minWidth: 0,
                                            mt: 0.5,
                                            p: 1,
                                            borderRadius: 1,
                                            bgcolor: "grey.900",
                                            borderLeft: 2,
                                            borderColor: "grey.700",
                                            fontSize: "0.85em",
                                            color: "grey.400",
                                            maxHeight: 300,
                                            overflow: "auto",
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
                                                bgcolor: "grey.950",
                                                p: 1,
                                                borderRadius: 1,
                                                overflow: "auto",
                                                fontSize: "0.9em",
                                            },
                                            "& code": {
                                                fontFamily: "monospace",
                                                fontSize: "0.9em",
                                            },
                                            "& :not(pre) > code": {
                                                bgcolor: "grey.950",
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
                                            rehypePlugins={[rehypeKatex]}
                                        >
                                            {msg.thinking}
                                        </ReactMarkdown>
                                    </Box>
                                </Collapse>
                            </Box>
                        )}
                        {msg.toolResults?.map((result) => {
                            const image = result.image;
                            if (!image) return null;
                            return (
                                <Box
                                    key={`${result.toolCallId}-image`}
                                    sx={{ mb: 1 }}
                                >
                                    <Box
                                        component="img"
                                        src={image.dataUrl}
                                        alt={image.name}
                                        sx={{
                                            display: "block",
                                            maxWidth: "100%",
                                            maxHeight: 520,
                                            borderRadius: 1,
                                            objectFit: "contain",
                                            bgcolor: "grey.950",
                                        }}
                                    />
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            color: "grey.500",
                                            display: "block",
                                            mt: 0.5,
                                        }}
                                    >
                                        {image.path}
                                    </Typography>
                                </Box>
                            );
                        })}
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
                                "& h1, & h2, & h3, & h4, & h5, & h6": {
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
                                "& a": {
                                    color: "inherit",
                                    textDecoration: "underline",
                                },
                            }}
                        >
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={{
                                    a: ({ node, children, ...props }) => (
                                        <a
                                            {...props}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {children}
                                        </a>
                                    ),
                                }}
                            >
                                {msg.content || "..."}
                            </ReactMarkdown>
                        </Box>
                    </>
                ) : (
                    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
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
    );
}
