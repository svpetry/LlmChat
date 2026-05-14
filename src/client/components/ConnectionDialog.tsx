import { useState } from "react";
import { useAtom } from "jotai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Box,
    Button,
    Card,
    CardContent,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    TextField,
    Typography,
    Alert,
} from "@mui/material";
import { connectionAtom } from "../atoms.js";
import { fetchSettings, saveSettings, fetchModels } from "../api.js";

export default function ConnectionDialog() {
    const [connection, setConnection] = useAtom(connectionAtom);
    const [baseUrl, setBaseUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [error, setError] = useState("");
    const queryClient = useQueryClient();

    useQuery({
        queryKey: ["settings"],
        queryFn: async () => {
            const data = await fetchSettings();
            if (data.baseUrl) setBaseUrl(data.baseUrl);
            if (data.apiKey) setApiKey(data.apiKey);
            if (data.selectedModel) {
                setConnection((prev) => ({
                    ...prev,
                    selectedModel: data.selectedModel,
                }));
            }
            return data;
        },
    });

    const saveMutation = useMutation({
        mutationFn: saveSettings,
    });

    const modelsMutation = useMutation({
        mutationFn: async () => {
            await saveMutation.mutateAsync({ baseUrl, apiKey });
            return fetchModels();
        },
        onSuccess: async (data) => {
            setConnection((prev) => ({
                ...prev,
                baseUrl,
                apiKey,
                models: data.models,
                selectedModel: "",
            }));
            setError("");
            // Refetch settings to get the saved model for this URL
            const settings = await queryClient.fetchQuery({
                queryKey: ["settings"],
                queryFn: fetchSettings,
            });
            if (settings.selectedModel) {
                setConnection((prev) => ({
                    ...prev,
                    selectedModel: settings.selectedModel,
                }));
            }
        },
        onError: (err: Error) => {
            setError(err.message);
        },
    });

    const handleConnect = () => {
        if (!baseUrl.trim() || !apiKey.trim()) {
            setError("Base URL and API Key are required");
            return;
        }
        setError("");
        modelsMutation.mutate();
    };

    const handleStartChat = () => {
        if (!connection.selectedModel) return;
        saveMutation.mutate({
            baseUrl,
            apiKey,
            selectedModel: connection.selectedModel,
        });
        setConnection((prev) => ({ ...prev, connected: true }));
    };

    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                p: 2,
            }}
        >
            <Card sx={{ maxWidth: 480, width: "100%" }}>
                <CardContent
                    sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                    <Typography variant="h5" align="center">
                        LLM Chat v{__APP_VERSION__}
                    </Typography>

                    {error && <Alert severity="error">{error}</Alert>}

                    <TextField
                        label="API Base URL"
                        placeholder="http://192.168.0.20:8000/v1"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        fullWidth
                        disabled={modelsMutation.isPending}
                    />

                    <TextField
                        label="API Key"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        fullWidth
                        disabled={modelsMutation.isPending}
                    />

                    <Button
                        variant="contained"
                        onClick={handleConnect}
                        disabled={modelsMutation.isPending}
                        fullWidth
                    >
                        {modelsMutation.isPending ? (
                            <CircularProgress size={24} />
                        ) : (
                            "Connect"
                        )}
                    </Button>

                    {connection.models.length > 0 && (
                        <>
                            <FormControl fullWidth>
                                <InputLabel>Model</InputLabel>
                                <Select
                                    value={connection.selectedModel}
                                    label="Model"
                                    onChange={(e) =>
                                        setConnection((prev) => ({
                                            ...prev,
                                            selectedModel: e.target.value,
                                        }))
                                    }
                                >
                                    {connection.models.map((model) => (
                                        <MenuItem key={model} value={model}>
                                            {model}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Button
                                variant="contained"
                                color="success"
                                onClick={handleStartChat}
                                disabled={!connection.selectedModel}
                                fullWidth
                            >
                                Start Chat
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}
