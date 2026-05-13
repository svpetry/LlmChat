import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeHomeFileTool } from "../fileAccess.js";

let homeDir: string;

beforeEach(async () => {
    homeDir = await mkdtemp(path.join(os.tmpdir(), "llm-chat-home-"));
    process.env.LLM_CHAT_HOME_DIR = homeDir;
});

afterEach(async () => {
    delete process.env.LLM_CHAT_HOME_DIR;
    await rm(homeDir, { recursive: true, force: true });
});

describe("home file access tools", () => {
    it("creates, reads, edits, searches, and deletes files under the configured home", async () => {
        await executeHomeFileTool(
            "create_home_path",
            JSON.stringify({
                path: "notes/todo.txt",
                kind: "file",
                content: "one\ntwo\nthree\n",
            }),
        );

        await executeHomeFileTool(
            "edit_home_file_lines",
            JSON.stringify({
                path: "notes/todo.txt",
                operation: "replace",
                startLine: 2,
                endLine: 2,
                content: "TWO",
            }),
        );

        expect(
            await readFile(path.join(homeDir, "notes/todo.txt"), "utf8"),
        ).toBe("one\nTWO\nthree\n");

        const readResult = await executeHomeFileTool(
            "read_home_file",
            JSON.stringify({
                path: "notes/todo.txt",
                startLine: 2,
                lineCount: 1,
            }),
        );
        expect(readResult.content).toContain('"content": "TWO"');

        const textSearch = await executeHomeFileTool(
            "search_home_file_text",
            JSON.stringify({ path: "notes", query: "TWO" }),
        );
        expect(textSearch.summary).toContain("1 text match");

        const pathSearch = await executeHomeFileTool(
            "search_home_paths",
            JSON.stringify({ query: "todo" }),
        );
        expect(pathSearch.content).toContain("todo.txt");

        await executeHomeFileTool(
            "delete_home_path",
            JSON.stringify({ path: "notes/todo.txt" }),
        );
        const listing = await executeHomeFileTool(
            "list_home_directory",
            JSON.stringify({ path: "notes" }),
        );
        expect(listing.content).not.toContain("todo.txt");
    });

    it("reports recursive directory size and timestamps", async () => {
        await mkdir(path.join(homeDir, "docs"), { recursive: true });
        await writeFile(path.join(homeDir, "docs/a.txt"), "hello", "utf8");
        await writeFile(path.join(homeDir, "docs/b.txt"), "world", "utf8");

        const result = await executeHomeFileTool(
            "get_home_path_info",
            JSON.stringify({ path: "docs" }),
        );

        expect(result.content).toContain('"kind": "directory"');
        expect(result.content).toContain('"bytes": 10');
        expect(result.content).toContain('"createdAt"');
        expect(result.content).toContain('"modifiedAt"');
    });

    it("rejects paths outside the configured home", async () => {
        const outside = path.join(os.tmpdir(), "outside.txt");
        await writeFile(outside, "secret", "utf8");

        await expect(
            executeHomeFileTool(
                "read_home_file",
                JSON.stringify({ path: outside }),
            ),
        ).rejects.toThrow("outside");

        await rm(outside, { force: true });
    });
});
