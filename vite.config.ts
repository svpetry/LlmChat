import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";

const pkg = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
);

export default defineConfig({
    plugins: [react({ tsconfigPath: "./tsconfig.client.json" })],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:8000",
                changeOrigin: true,
            },
        },
    },
});
