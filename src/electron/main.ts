import { appendFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const electronApi = (
    globalThis as {
        __LLM_CHAT_ELECTRON__?: typeof import("electron");
    }
).__LLM_CHAT_ELECTRON__;

if (!electronApi) {
    throw new Error("Electron runtime API was not provided by bootstrap.");
}

const { app, BrowserWindow, Menu, dialog, shell } = electronApi;
const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | undefined;
let server: Server | undefined;

function log(message: string, error?: unknown) {
    const details =
        error instanceof Error
            ? `${error.stack ?? error.message}`
            : error === undefined
              ? ""
              : String(error);
    const line = `[${new Date().toISOString()}] ${message}${details ? `\n${details}` : ""}\n`;

    try {
        appendFileSync(join(app.getPath("userData"), "main.log"), line);
    } catch {
        console.error(line);
    }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.quit();
}

function getStaticDir() {
    return join(__dirname, "..", "dist");
}

function getSqlJsWasmPath() {
    if (app.isPackaged) {
        return join(process.resourcesPath, "sql-wasm.wasm");
    }

    return join(
        __dirname,
        "..",
        "node_modules",
        "sql.js",
        "dist",
        "sql-wasm.wasm",
    );
}

async function ensureServer() {
    if (server) {
        return server;
    }

    process.env.LLM_CHAT_DATA_DIR = join(app.getPath("userData"), "data");
    process.env.LLM_CHAT_SQLJS_WASM_PATH = getSqlJsWasmPath();
    log(`Starting server with data dir ${process.env.LLM_CHAT_DATA_DIR}`);
    log(`Using sql.js wasm at ${process.env.LLM_CHAT_SQLJS_WASM_PATH}`);

    const { startServer } = await import("../server/index.js");
    server = await startServer({
        host: "127.0.0.1",
        port: 0,
        staticDir: getStaticDir(),
    });
    log("Server started");

    return server;
}

async function createWindow() {
    log("Creating window");
    const runningServer = await ensureServer();
    const address = runningServer.address() as AddressInfo;
    const appUrl = `http://127.0.0.1:${address.port}`;
    log(`Loading ${appUrl}`);

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 920,
        minHeight: 640,
        title: "LLM Chat",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    mainWindow.setMenu(null);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: "deny" };
    });

    mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(appUrl)) {
            event.preventDefault();
            void shell.openExternal(url);
        }
    });

    await mainWindow.loadURL(appUrl);
    log("Window loaded");
}

app.on("second-instance", () => {
    if (!mainWindow) {
        return;
    }

    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    mainWindow.focus();
});

process.on("uncaughtException", (error) => {
    log("Uncaught exception", error);
});

process.on("unhandledRejection", (error) => {
    log("Unhandled rejection", error);
});

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    void createWindow().catch((error) => {
        log("Failed to create main window", error);
        dialog.showErrorBox(
            "LLM Chat failed to start",
            error instanceof Error ? error.message : String(error),
        );
        app.quit();
    });
});

app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        void createWindow();
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("before-quit", () => {
    server?.close();
});
