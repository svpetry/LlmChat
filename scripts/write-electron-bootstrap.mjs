import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(rootDir, "dist-electron");

mkdirSync(outputDir, { recursive: true });
writeFileSync(
    join(outputDir, "main.cjs"),
    `const fs = require("node:fs");
const path = require("node:path");
const electron = require("electron");

function writeBootstrapLog(message) {
    try {
        const baseDir = process.env.APPDATA || process.cwd();
        const logDir = path.join(baseDir, "llm-chat");
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(
            path.join(logDir, "main.log"),
            "[" + new Date().toISOString() + "] " + message + "\\n",
        );
    } catch (error) {
        console.error(error);
    }
}

writeBootstrapLog(
    "Bootstrap loaded; electron type=" +
        typeof electron +
        "; app type=" +
        typeof electron.app,
);

globalThis.__LLM_CHAT_ELECTRON__ = electron;

import("./main.mjs").catch((error) => {
    const message = error && error.stack ? error.stack : String(error);
    writeBootstrapLog("Failed to import main.mjs\\n" + message);
    console.error(message);

    try {
        electron.dialog.showErrorBox("LLM Chat failed to start", message);
    } catch {
        // The dialog module may be unavailable if Electron failed very early.
    }

    if (electron.app && !electron.app.isDestroyed()) {
        electron.app.quit();
    }
});
`,
);
