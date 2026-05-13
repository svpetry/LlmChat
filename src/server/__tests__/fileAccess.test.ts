import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchPublicUrlBytes = vi.hoisted(() => vi.fn());

vi.mock("../search.js", () => ({
    fetchPublicUrlBytes: mockFetchPublicUrlBytes,
}));

import { executeHomeFileTool } from "../fileAccess.js";

let homeDir: string;

beforeEach(async () => {
    mockFetchPublicUrlBytes.mockReset();
    homeDir = await mkdtemp(path.join(os.tmpdir(), "llm-chat-home-"));
    process.env.LLM_CHAT_HOME_DIR = homeDir;
});

afterEach(async () => {
    vi.unstubAllGlobals();
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

    it("reads raster images for chat display", async () => {
        const pngBytes = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
            "base64",
        );
        await writeFile(path.join(homeDir, "pixel.png"), pngBytes);

        const result = await executeHomeFileTool(
            "read_home_image",
            JSON.stringify({ path: "pixel.png" }),
        );

        expect(result.summary).toBe("Displayed ~" + path.sep + "pixel.png");
        expect(result.content).toContain('"displayedToUser": true');
        expect(result.image).toEqual(
            expect.objectContaining({
                path: "~" + path.sep + "pixel.png",
                name: "pixel.png",
                mimeType: "image/png",
                bytes: pngBytes.length,
                dataUrl: expect.stringContaining("data:image/png;base64,"),
            }),
        );
    });

    it("reads direct image URLs from pointer files for chat display", async () => {
        const pngBytes = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
            "base64",
        );
        await writeFile(
            path.join(homeDir, "anime_girl.png"),
            "https://example.com/anime_girl.png",
            "utf8",
        );

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                headers: {
                    get: (name: string) =>
                        name.toLowerCase() === "content-length"
                            ? String(pngBytes.length)
                            : null,
                },
                body: {
                    getReader: () => {
                        let read = false;
                        return {
                            read: vi.fn(async () => {
                                if (read) return { done: true };
                                read = true;
                                return { done: false, value: pngBytes };
                            }),
                        };
                    },
                },
            })),
        );

        const result = await executeHomeFileTool(
            "read_home_image",
            JSON.stringify({ path: "anime_girl.png" }),
        );

        expect(result.summary).toContain("Displayed ~" + path.sep);
        expect(result.summary).toContain("https://example.com/anime_girl.png");
        expect(result.content).toContain(
            '"sourceUrl": "https://example.com/anime_girl.png"',
        );
        expect(result.image).toEqual(
            expect.objectContaining({
                path: "~" + path.sep + "anime_girl.png",
                name: "anime_girl.png",
                mimeType: "image/png",
                bytes: pngBytes.length,
                dataUrl: expect.stringContaining("data:image/png;base64,"),
            }),
        );
    });

    it("downloads public URLs to binary files under the configured home", async () => {
        const pngBytes = Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
            "base64",
        );
        mockFetchPublicUrlBytes.mockResolvedValue({
            finalUrl: "https://example.com/anime_girl.png",
            contentType: "image/png",
            bytes: pngBytes,
        });

        const result = await executeHomeFileTool(
            "download_home_file",
            JSON.stringify({
                url: "https://example.com/anime_girl.png",
                path: "anime_girl.png",
            }),
        );

        expect(mockFetchPublicUrlBytes).toHaveBeenCalledWith(
            "https://example.com/anime_girl.png",
            25_000_000,
        );
        expect(await readFile(path.join(homeDir, "anime_girl.png"))).toEqual(
            pngBytes,
        );
        expect(result.summary).toBe(
            "Downloaded ~" + path.sep + "anime_girl.png",
        );
        expect(result.content).toContain('"contentType": "image/png"');
        expect(result.content).toContain(`"bytes": ${pngBytes.length}`);
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
