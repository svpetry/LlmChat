import { build } from "esbuild";

await build({
    entryPoints: ["src/electron/main.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["sql.js"],
    outfile: "dist-electron/main.mjs",
    banner: {
        js: [
            'import { createRequire as __llmChatCreateRequire } from "node:module";',
            "const require = __llmChatCreateRequire(import.meta.url);",
        ].join("\n"),
    },
});
