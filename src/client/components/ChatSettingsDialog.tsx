import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Select,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import { executeSettingsAtom, fileAccessSettingsAtom, searchSettingsAtom } from "../atoms.js";
import { memorySettingsAtom } from "../atoms.js";
import {
    fetchExecuteSettings,
    fetchFileAccessSettings,
    fetchMemorySettings,
    fetchSearchSettings,
    saveExecuteSettings,
    saveFileAccessSettings,
    saveMemorySettings,
    saveSearchSettings,
} from "../api.js";

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function ChatSettingsDialog({ open, onClose }: Props) {
    const [searchSettings, setSearchSettings] = useAtom(searchSettingsAtom);
    const [, setFileAccessSettings] = useAtom(fileAccessSettingsAtom);
    const [, setMemorySettings] = useAtom(memorySettingsAtom);
    const [, setExecuteSettings] = useAtom(executeSettingsAtom);
    const [enabled, setEnabled] = useState(false);
    const [fileAccessEnabled, setFileAccessEnabled] = useState(false);
    const [memoryEnabled, setMemoryEnabled] = useState(false);
    const [executeEnabled, setExecuteEnabled] = useState(false);
    const [provider, setProvider] = useState<"brave" | "searxng">("brave");
    const [apiKey, setApiKey] = useState("");
    const [searxngUrl, setSearxngUrl] = useState("");
    const [saving, setSaving] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!open) {
            setLoaded(false);
            return;
        }

        Promise.all([
            fetchSearchSettings(),
            fetchFileAccessSettings(),
            fetchMemorySettings(),
            fetchExecuteSettings(),
        ]).then(([s, f, m, x]) => {
            setSearchSettings(s);
            setFileAccessSettings(f);
            setMemorySettings(m);
            setExecuteSettings(x);
            setEnabled(s.enabled);
            setFileAccessEnabled(f.enabled);
            setMemoryEnabled(m.enabled);
            setExecuteEnabled(x.enabled);
            setProvider(s.provider);
            setApiKey("");
            setSearxngUrl("");
            setLoaded(true);
        });
    }, [open, setExecuteSettings, setFileAccessSettings, setMemorySettings, setSearchSettings]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const data: Parameters<typeof saveSearchSettings>[0] = {
                enabled,
                provider,
            };
            if (provider === "brave" && apiKey) {
                data.searchApiKey = apiKey;
            }
            if (provider === "searxng" && searxngUrl) {
                data.searxngUrl = searxngUrl;
            }
            await Promise.all([
                saveSearchSettings(data),
                saveFileAccessSettings({ enabled: fileAccessEnabled }),
                saveMemorySettings({ enabled: memoryEnabled }),
                saveExecuteSettings({ enabled: executeEnabled }),
            ]);
            const [updatedSearch, updatedFileAccess, updatedMemory, updatedExecute] =
                await Promise.all([
                    fetchSearchSettings(),
                    fetchFileAccessSettings(),
                    fetchMemorySettings(),
                    fetchExecuteSettings(),
                ]);
            setSearchSettings(updatedSearch);
            setFileAccessSettings(updatedFileAccess);
            setMemorySettings(updatedMemory);
            setExecuteSettings(updatedExecute);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open && loaded} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Settings</DialogTitle>
            <DialogContent>
                <Box
                    sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        mt: 1,
                    }}
                >
                    <FormControlLabel
                        control={
                            <Switch
                                checked={enabled}
                                onChange={(e) => setEnabled(e.target.checked)}
                            />
                        }
                        label="Web Search"
                    />

                    {enabled && (
                        <>
                            <Box
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                }}
                            >
                                <Typography
                                    variant="body2"
                                    sx={{ minWidth: 60 }}
                                >
                                    Provider
                                </Typography>
                                <Select
                                    size="small"
                                    value={provider}
                                    onChange={(e) =>
                                        setProvider(
                                            e.target.value as
                                                | "brave"
                                                | "searxng",
                                        )
                                    }
                                    fullWidth
                                >
                                    <MenuItem value="brave">
                                        Brave Search
                                    </MenuItem>
                                    <MenuItem value="searxng">SearXNG</MenuItem>
                                </Select>
                            </Box>

                            {provider === "brave" && (
                                <TextField
                                    label="Brave API Key"
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={
                                        searchSettings.apiKeySet
                                            ? "Key saved - leave empty to keep"
                                            : ""
                                    }
                                    size="small"
                                    fullWidth
                                />
                            )}

                            {provider === "searxng" && (
                                <TextField
                                    label="SearXNG Instance URL"
                                    value={searxngUrl}
                                    onChange={(e) =>
                                        setSearxngUrl(e.target.value)
                                    }
                                    placeholder={
                                        searchSettings.searxngUrlSet
                                            ? "URL saved - leave empty to keep"
                                            : "https://searx.be"
                                    }
                                    size="small"
                                    fullWidth
                                />
                            )}
                        </>
                    )}

                    <Box>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={memoryEnabled}
                                    onChange={(e) =>
                                        setMemoryEnabled(e.target.checked)
                                    }
                                />
                            }
                            label="Memory"
                        />
                        <Typography variant="caption" color="text.secondary">
                            Allows model tool calls to save and search
                            remembered facts in the local SQLite database.
                        </Typography>
                    </Box>

                    <Box>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={fileAccessEnabled}
                                    onChange={(e) =>
                                        setFileAccessEnabled(e.target.checked)
                                    }
                                />
                            }
                            label="Home Directory File Access"
                        />
                        <Typography variant="caption" color="text.secondary">
                            Allows model tool calls to read, search, edit,
                            create, download, and delete files under your home
                            directory.
                        </Typography>
                    </Box>

                    <Box>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={executeEnabled}
                                    onChange={(e) =>
                                        setExecuteEnabled(e.target.checked)
                                    }
                                />
                            }
                            label="Command Execution"
                        />
                        <Typography variant="caption" color="text.secondary">
                            Allows the model to execute shell commands
                            (PowerShell on Windows, /bin/sh on other platforms)
                            in your home directory. Use with caution.
                        </Typography>
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    variant="contained"
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
