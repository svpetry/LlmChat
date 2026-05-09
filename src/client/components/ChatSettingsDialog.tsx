import { useState, useEffect } from "react";
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
import { searchSettingsAtom } from "../atoms.js";
import {
    fetchSearchSettings,
    saveSearchSettings,
} from "../api.js";

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function ChatSettingsDialog({ open, onClose }: Props) {
    const [searchSettings, setSearchSettings] = useAtom(searchSettingsAtom);
    const [enabled, setEnabled] = useState(false);
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
        fetchSearchSettings().then((s) => {
            setSearchSettings(s);
            setEnabled(s.enabled);
            setProvider(s.provider);
            setApiKey("");
            setSearxngUrl("");
            setLoaded(true);
        });
    }, [open, setSearchSettings]);

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
            await saveSearchSettings(data);
            const updated = await fetchSearchSettings();
            setSearchSettings(updated);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open && loaded} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Settings</DialogTitle>
            <DialogContent>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
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
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography variant="body2" sx={{ minWidth: 60 }}>
                                    Provider
                                </Typography>
                                <Select
                                    size="small"
                                    value={provider}
                                    onChange={(e) =>
                                        setProvider(e.target.value as "brave" | "searxng")
                                    }
                                    fullWidth
                                >
                                    <MenuItem value="brave">Brave Search</MenuItem>
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
                                            ? "Key saved — leave empty to keep"
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
                                    onChange={(e) => setSearxngUrl(e.target.value)}
                                    placeholder={
                                        searchSettings.searxngUrlSet
                                            ? "URL saved — leave empty to keep"
                                            : "https://searx.be"
                                    }
                                    size="small"
                                    fullWidth
                                />
                            )}
                        </>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving} variant="contained">
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
