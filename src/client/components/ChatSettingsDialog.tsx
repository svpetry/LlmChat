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
import { fileAccessSettingsAtom, searchSettingsAtom } from "../atoms.js";
import {
    fetchFileAccessSettings,
    fetchSearchSettings,
    saveFileAccessSettings,
    saveSearchSettings,
} from "../api.js";

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function ChatSettingsDialog({ open, onClose }: Props) {
    const [searchSettings, setSearchSettings] = useAtom(searchSettingsAtom);
    const [, setFileAccessSettings] = useAtom(fileAccessSettingsAtom);
    const [enabled, setEnabled] = useState(false);
    const [fileAccessEnabled, setFileAccessEnabled] = useState(false);
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

        Promise.all([fetchSearchSettings(), fetchFileAccessSettings()]).then(
            ([s, f]) => {
                setSearchSettings(s);
                setFileAccessSettings(f);
                setEnabled(s.enabled);
                setFileAccessEnabled(f.enabled);
                setProvider(s.provider);
                setApiKey("");
                setSearxngUrl("");
                setLoaded(true);
            },
        );
    }, [open, setFileAccessSettings, setSearchSettings]);

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
            ]);
            const [updatedSearch, updatedFileAccess] = await Promise.all([
                fetchSearchSettings(),
                fetchFileAccessSettings(),
            ]);
            setSearchSettings(updatedSearch);
            setFileAccessSettings(updatedFileAccess);
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
                            create, and delete files under your home directory.
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
