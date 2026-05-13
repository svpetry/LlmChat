import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["src/{client,server}/**/*.test.ts"],
        setupFiles: ["src/server/__tests__/setup.ts"],
    },
});
