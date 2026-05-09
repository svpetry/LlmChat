import { useAtomValue } from "jotai";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { connectionAtom } from "./atoms.js";
import ConnectionDialog from "./components/ConnectionDialog.js";
import ChatScreen from "./components/ChatScreen.js";

const theme = createTheme({
    palette: { mode: "dark" },
});

export default function App() {
    const connection = useAtomValue(connectionAtom);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {connection.connected ? <ChatScreen /> : <ConnectionDialog />}
        </ThemeProvider>
    );
}
