import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import { router } from "./routes/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultStaticDir = join(__dirname, "..", "..", "dist");

export interface CreateAppOptions {
    staticDir?: string;
}

export interface StartServerOptions extends CreateAppOptions {
    host?: string;
    port?: number;
}

export function createApp(options: CreateAppOptions = {}) {
    const app = express();
    const staticDir = options.staticDir ?? defaultStaticDir;

    app.use(express.json());
    app.use(router);
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => {
        res.sendFile(join(staticDir, "index.html"));
    });

    return app;
}

export function startServer(options: StartServerOptions = {}): Promise<Server> {
    const port = options.port ?? Number(process.env.PORT ?? 8000);
    const app = createApp(options);

    return new Promise((resolveServer) => {
        const server = app.listen(port, options.host, () => {
            const address = server.address();
            const url =
                typeof address === "object" && address
                    ? `http://${address.address === "::" ? "localhost" : address.address}:${address.port}`
                    : `http://localhost:${port}`;

            console.log(`Server running at ${url}`);
            resolveServer(server);
        });
    });
}

const isDirectRun =
    process.argv[1] &&
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
    void startServer();
}
