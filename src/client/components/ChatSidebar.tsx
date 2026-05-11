import {
    Box,
    Button,
    Divider,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Tooltip,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import DeleteIcon from "@mui/icons-material/Delete";
import type { ChatSummary } from "../atoms.js";

function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

interface ChatSidebarProps {
    chats: ChatSummary[];
    activeChatId: string | null;
    onSelectChat: (chatId: string) => void;
    onNewChat: () => void;
    onDeleteChat: (chatId: string) => void;
}

export default function ChatSidebar({
    chats,
    activeChatId,
    onSelectChat,
    onNewChat,
    onDeleteChat,
}: ChatSidebarProps) {
    return (
        <Box
            sx={{
                width: 260,
                minWidth: 260,
                height: "100vh",
                bgcolor: "grey.900",
                display: "flex",
                flexDirection: "column",
                borderRight: 1,
                borderColor: "grey.800",
            }}
        >
            <Box sx={{ p: 1.5 }}>
                <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<AddIcon />}
                    onClick={onNewChat}
                    size="small"
                >
                    New Chat
                </Button>
            </Box>
            <Divider />
            <List sx={{ flexGrow: 1, overflow: "auto", px: 1, py: 0.5 }}>
                {chats.map((chat) => (
                    <ListItemButton
                        key={chat.id}
                        selected={chat.id === activeChatId}
                        onClick={() => onSelectChat(chat.id)}
                        sx={{
                            borderRadius: 1,
                            mb: 0.25,
                            "&.Mui-selected": {
                                bgcolor: "grey.800",
                            },
                            "&.Mui-selected:hover": {
                                bgcolor: "grey.800",
                            },
                            "&:hover": {
                                bgcolor: "grey.850",
                            },
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: 32 }}>
                            <ChatBubbleOutlineIcon
                                fontSize="small"
                                sx={{ color: "grey.500" }}
                            />
                        </ListItemIcon>
                        <Tooltip title={chat.title} placement="right" arrow>
                            <ListItemText
                                sx={{ minWidth: 0 }}
                                primary={chat.title}
                                primaryTypographyProps={{
                                    noWrap: true,
                                    fontSize: "0.875rem",
                                }}
                                secondary={formatRelativeTime(chat.updatedAt)}
                                secondaryTypographyProps={{
                                    noWrap: true,
                                    fontSize: "0.7rem",
                                    color: "grey.600",
                                }}
                            />
                        </Tooltip>
                        <Tooltip title="Delete chat">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteChat(chat.id);
                                }}
                                sx={{
                                    opacity: 0,
                                    color: "grey.500",
                                    "&:hover": { color: "grey.300" },
                                    ".MuiListItemButton-root:hover &": {
                                        opacity: 1,
                                    },
                                }}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </ListItemButton>
                ))}
            </List>
            {chats.length === 0 && (
                <Typography
                    variant="body2"
                    sx={{ color: "grey.600", textAlign: "center", py: 4 }}
                >
                    No chats yet
                </Typography>
            )}
        </Box>
    );
}
