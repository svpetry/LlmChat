import { createReadStream } from "node:fs";
import {
    lstat,
    mkdir,
    open,
    readdir,
    readFile,
    realpath,
    rm,
    stat,
    writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fetchPublicUrlBytes } from "./search.js";

const MAX_LIST_ENTRIES = 2_000;
const MAX_SEARCH_RESULTS = 200;
const MAX_TEXT_MATCHES = 200;
const MAX_FILE_READ_BYTES = 1_000_000;
const MAX_TEXT_SEARCH_FILE_BYTES = 2_000_000;
const MAX_IMAGE_READ_BYTES = 8_000_000;
const MAX_HOME_DOWNLOAD_BYTES = 25_000_000;

type HomeToolResult = {
    summary: string;
    content: string;
    image?: {
        path: string;
        name: string;
        mimeType: string;
        bytes: number;
        dataUrl: string;
    };
};

export const homeFileTools = [
    {
        type: "function" as const,
        function: {
            name: "list_home_directory",
            description:
                "List files and folders under the user's home directory. Can recurse through all subfolders without a depth limit.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "Path to list, relative to the home directory or an absolute path inside it. Defaults to the home directory.",
                    },
                    recursive: {
                        type: "boolean",
                        description:
                            "Whether to include all nested files and folders.",
                    },
                    maxEntries: {
                        type: "number",
                        description:
                            "Maximum entries to return. Defaults to 2000.",
                    },
                },
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "get_home_path_info",
            description:
                "Get size, creation date, modification date, and type for a file or folder under the user's home directory.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "Path to inspect, relative to the home directory or an absolute path inside it.",
                    },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "search_home_paths",
            description:
                "Search for files or folders by name under the user's home directory.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "Folder to search from, relative to the home directory or an absolute path inside it. Defaults to the home directory.",
                    },
                    query: {
                        type: "string",
                        description: "Name text to search for.",
                    },
                    kind: {
                        type: "string",
                        enum: ["any", "file", "directory"],
                        description: "Limit matches by type.",
                    },
                    maxResults: {
                        type: "number",
                        description:
                            "Maximum matches to return. Defaults to 200.",
                    },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "read_home_file",
            description:
                "Read all or part of a text file under the user's home directory.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "File to read, relative to the home directory or an absolute path inside it.",
                    },
                    startLine: {
                        type: "number",
                        description:
                            "Optional 1-based first line to read. Use with lineCount.",
                    },
                    lineCount: {
                        type: "number",
                        description:
                            "Optional number of lines to read from startLine.",
                    },
                    offset: {
                        type: "number",
                        description:
                            "Optional character offset to start reading from.",
                    },
                    length: {
                        type: "number",
                        description:
                            "Optional maximum number of characters to return.",
                    },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "read_home_image",
            description:
                "Read a raster image file under the user's home directory and display it in the chat.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "Image file to display, relative to the home directory or an absolute path inside it.",
                    },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "search_home_file_text",
            description:
                "Search text inside files under the user's home directory.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "File or folder to search, relative to the home directory or an absolute path inside it. Defaults to the home directory.",
                    },
                    query: {
                        type: "string",
                        description: "Text to search for.",
                    },
                    caseSensitive: {
                        type: "boolean",
                        description:
                            "Whether matching should be case-sensitive.",
                    },
                    maxMatches: {
                        type: "number",
                        description:
                            "Maximum matches to return. Defaults to 200.",
                    },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "edit_home_file_lines",
            description:
                "Edit a text file under the user's home directory by inserting, replacing, or deleting lines. Lines are 1-based.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "File to edit, relative to the home directory or an absolute path inside it.",
                    },
                    operation: {
                        type: "string",
                        enum: ["insert", "replace", "delete"],
                    },
                    line: {
                        type: "number",
                        description:
                            "For insert: 1-based line before which content is inserted. Use lineCount + 1 to append.",
                    },
                    startLine: {
                        type: "number",
                        description:
                            "For replace/delete: first 1-based line in the range.",
                    },
                    endLine: {
                        type: "number",
                        description:
                            "For replace/delete: last 1-based line in the range.",
                    },
                    content: {
                        type: "string",
                        description:
                            "For insert/replace: text to insert. May contain multiple lines.",
                    },
                },
                required: ["path", "operation"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "create_home_path",
            description:
                "Create a file or folder under the user's home directory.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "Path to create, relative to the home directory or an absolute path inside it.",
                    },
                    kind: {
                        type: "string",
                        enum: ["file", "directory"],
                    },
                    content: {
                        type: "string",
                        description:
                            "Initial text content when creating a file.",
                    },
                    overwrite: {
                        type: "boolean",
                        description:
                            "Whether to replace an existing file. Defaults to false.",
                    },
                },
                required: ["path", "kind"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "download_home_file",
            description:
                "Download bytes from a public http or https URL and save them to a file under the user's home directory. Use this for images or other binary files; create_home_path only writes text.",
            parameters: {
                type: "object",
                properties: {
                    url: {
                        type: "string",
                        description:
                            "Public http or https URL to download. Local and private-network URLs are blocked.",
                    },
                    path: {
                        type: "string",
                        description:
                            "Destination file path, relative to the home directory or an absolute path inside it.",
                    },
                    overwrite: {
                        type: "boolean",
                        description:
                            "Whether to replace an existing file. Defaults to false.",
                    },
                },
                required: ["url", "path"],
            },
        },
    },
    {
        type: "function" as const,
        function: {
            name: "delete_home_path",
            description:
                "Delete a file or folder under the user's home directory.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "Path to delete, relative to the home directory or an absolute path inside it.",
                    },
                    recursive: {
                        type: "boolean",
                        description: "Required to delete non-empty folders.",
                    },
                },
                required: ["path"],
            },
        },
    },
] as const;

export async function executeHomeFileTool(
    name: string,
    rawArguments: string,
): Promise<HomeToolResult> {
    let args: Record<string, unknown>;
    try {
        args = JSON.parse(rawArguments) as Record<string, unknown>;
    } catch {
        throw new Error("Invalid tool call arguments");
    }

    switch (name) {
        case "list_home_directory":
            return listHomeDirectory(args);
        case "get_home_path_info":
            return getHomePathInfo(args);
        case "search_home_paths":
            return searchHomePaths(args);
        case "read_home_file":
            return readHomeFile(args);
        case "read_home_image":
            return readHomeImage(args);
        case "search_home_file_text":
            return searchHomeFileText(args);
        case "edit_home_file_lines":
            return editHomeFileLines(args);
        case "create_home_path":
            return createHomePath(args);
        case "download_home_file":
            return downloadHomeFile(args);
        case "delete_home_path":
            return deleteHomePath(args);
        default:
            throw new Error(`Unknown file tool: ${name}`);
    }
}

async function listHomeDirectory(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const target = await resolveExistingPath(getString(args.path, "."));
    const info = await lstat(target);
    if (!info.isDirectory()) {
        throw new Error("Path is not a directory");
    }

    const recursive = args.recursive === true;
    const maxEntries = clampNumber(args.maxEntries, 1, MAX_LIST_ENTRIES);
    const entries: Array<Record<string, unknown>> = [];
    let truncated = false;

    async function visit(directory: string): Promise<void> {
        const children = await readdir(directory, { withFileTypes: true });
        for (const child of children) {
            if (entries.length >= maxEntries) {
                truncated = true;
                return;
            }

            const childPath = path.join(directory, child.name);
            const childStat = await lstat(childPath);
            entries.push(toPathEntry(childPath, childStat));

            if (
                recursive &&
                childStat.isDirectory() &&
                !childStat.isSymbolicLink()
            ) {
                await visit(childPath);
                if (truncated) return;
            }
        }
    }

    await visit(target);

    return jsonResult(
        `Listed ${entries.length} entr${entries.length === 1 ? "y" : "ies"}${truncated ? " (truncated)" : ""}`,
        { path: displayPath(target), recursive, truncated, entries },
    );
}

async function getHomePathInfo(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const target = await resolveExistingPath(requireString(args.path, "path"));
    const info = await lstat(target);
    const size =
        info.isDirectory() && !info.isSymbolicLink()
            ? await calculateDirectorySize(target)
            : {
                  bytes: info.size,
                  files: info.isFile() ? 1 : 0,
                  directories: 0,
              };

    return jsonResult(`Inspected ${displayPath(target)}`, {
        ...toPathEntry(target, info),
        size,
    });
}

async function searchHomePaths(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const target = await resolveExistingPath(getString(args.path, "."));
    const query = requireString(args.query, "query").toLowerCase();
    const kind = getString(args.kind, "any");
    const maxResults = clampNumber(args.maxResults, 1, MAX_SEARCH_RESULTS);
    const matches: Array<Record<string, unknown>> = [];
    let truncated = false;

    if (!["any", "file", "directory"].includes(kind)) {
        throw new Error("kind must be any, file, or directory");
    }

    async function visit(current: string): Promise<void> {
        if (matches.length >= maxResults) {
            truncated = true;
            return;
        }

        const currentStat = await lstat(current);
        const currentKind = pathKind(currentStat);
        const nameMatches = path
            .basename(current)
            .toLowerCase()
            .includes(query);
        const kindMatches = kind === "any" || currentKind === kind;
        if (nameMatches && kindMatches) {
            matches.push(toPathEntry(current, currentStat));
        }

        if (currentStat.isDirectory() && !currentStat.isSymbolicLink()) {
            const children = await readdir(current);
            for (const child of children) {
                await visit(path.join(current, child));
                if (truncated) return;
            }
        }
    }

    await visit(target);

    return jsonResult(
        `Found ${matches.length} path match${matches.length === 1 ? "" : "es"}${truncated ? " (truncated)" : ""}`,
        { query, path: displayPath(target), kind, truncated, matches },
    );
}

async function readHomeFile(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const target = await resolveExistingPath(requireString(args.path, "path"));
    await assertReadableFile(target);

    const text = await readLimitedTextFile(target, MAX_FILE_READ_BYTES);
    const startLine = getOptionalNumber(args.startLine);
    const lineCount = getOptionalNumber(args.lineCount);
    const offset = getOptionalNumber(args.offset);
    const length = getOptionalNumber(args.length);

    let content = text.content;
    let range: Record<string, number> | undefined;

    if (startLine !== undefined || lineCount !== undefined) {
        const firstLine = Math.max(1, startLine ?? 1);
        const count = Math.max(1, lineCount ?? 200);
        const lines = content.split(/\r\n|\n|\r/);
        content = lines.slice(firstLine - 1, firstLine - 1 + count).join("\n");
        range = { startLine: firstLine, lineCount: count };
    } else if (offset !== undefined || length !== undefined) {
        const start = Math.max(0, offset ?? 0);
        const count = Math.max(1, length ?? MAX_FILE_READ_BYTES);
        content = content.slice(start, start + count);
        range = { offset: start, length: count };
    }

    return jsonResult(`Read ${displayPath(target)}`, {
        path: displayPath(target),
        range,
        truncated: text.truncated,
        content,
    });
}

async function readHomeImage(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const target = await resolveExistingPath(requireString(args.path, "path"));
    await assertReadableFile(target);

    const info = await lstat(target);
    if (info.size > MAX_IMAGE_READ_BYTES) {
        throw new Error(
            `Image is too large; maximum size is ${MAX_IMAGE_READ_BYTES} bytes`,
        );
    }

    const originalBytes = await readFile(target);
    const imageSource = await resolveImageSource(originalBytes);
    const bytes = imageSource.bytes;
    const mimeType = detectImageMimeType(bytes);
    if (!mimeType) {
        throw new Error(
            "Unsupported image type. Supported raster formats are PNG, JPEG, GIF, WebP, BMP, and AVIF.",
        );
    }

    const image = {
        path: displayPath(target),
        name: path.basename(target),
        mimeType,
        bytes: bytes.length,
        dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
    };

    return {
        summary: `Displayed ${displayPath(target)}${imageSource.url ? ` from ${imageSource.url}` : ""}`,
        content: JSON.stringify(
            {
                path: image.path,
                name: image.name,
                mimeType: image.mimeType,
                bytes: image.bytes,
                sourceUrl: imageSource.url,
                displayedToUser: true,
                note: "The image was displayed in the chat UI. This tool result only provides metadata to the model.",
            },
            null,
            2,
        ),
        image,
    };
}

async function resolveImageSource(bytes: Buffer) {
    if (detectImageMimeType(bytes)) {
        return { bytes };
    }

    const url = parseImageUrlPointer(bytes);
    if (!url) {
        return { bytes };
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image URL: ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (
        contentLength &&
        Number.isFinite(Number(contentLength)) &&
        Number(contentLength) > MAX_IMAGE_READ_BYTES
    ) {
        throw new Error(
            `Image is too large; maximum size is ${MAX_IMAGE_READ_BYTES} bytes`,
        );
    }

    return {
        bytes: await readResponseBodyLimited(response, MAX_IMAGE_READ_BYTES),
        url,
    };
}

function parseImageUrlPointer(bytes: Buffer) {
    if (bytes.length > 2_000) return undefined;

    const text = new TextDecoder("utf-8", { fatal: false })
        .decode(bytes)
        .trim();
    if (!/^https?:\/\/\S+$/i.test(text)) return undefined;

    try {
        const url = new URL(text);
        return url.toString();
    } catch {
        return undefined;
    }
}

async function readResponseBodyLimited(response: Response, maxBytes: number) {
    if (!response.body) {
        return Buffer.from(await response.arrayBuffer());
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > maxBytes) {
            reader.cancel().catch(() => {});
            throw new Error(
                `Image is too large; maximum size is ${MAX_IMAGE_READ_BYTES} bytes`,
            );
        }
        chunks.push(chunk);
    }

    return Buffer.concat(chunks, total);
}

async function searchHomeFileText(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const target = await resolveExistingPath(getString(args.path, "."));
    const query = requireString(args.query, "query");
    const caseSensitive = args.caseSensitive === true;
    const maxMatches = clampNumber(args.maxMatches, 1, MAX_TEXT_MATCHES);
    const matches: Array<Record<string, unknown>> = [];
    let truncated = false;
    let filesScanned = 0;

    async function visit(current: string): Promise<void> {
        if (matches.length >= maxMatches) {
            truncated = true;
            return;
        }

        const currentStat = await lstat(current);
        if (currentStat.isDirectory() && !currentStat.isSymbolicLink()) {
            const children = await readdir(current);
            for (const child of children) {
                await visit(path.join(current, child));
                if (truncated) return;
            }
            return;
        }

        if (
            !currentStat.isFile() ||
            currentStat.size > MAX_TEXT_SEARCH_FILE_BYTES
        ) {
            return;
        }

        filesScanned++;
        await searchFileLines(
            current,
            query,
            caseSensitive,
            maxMatches,
            matches,
        );
        if (matches.length >= maxMatches) {
            truncated = true;
        }
    }

    await visit(target);

    return jsonResult(
        `Found ${matches.length} text match${matches.length === 1 ? "" : "es"} in ${filesScanned} file${filesScanned === 1 ? "" : "s"}${truncated ? " (truncated)" : ""}`,
        { query, path: displayPath(target), caseSensitive, truncated, matches },
    );
}

async function editHomeFileLines(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const target = await resolveExistingPath(requireString(args.path, "path"));
    await assertReadableFile(target);

    const operation = requireString(args.operation, "operation");
    if (!["insert", "replace", "delete"].includes(operation)) {
        throw new Error("operation must be insert, replace, or delete");
    }

    const original = await readFile(target, "utf8");
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    const trailingNewline = /\r?\n$/.test(original);
    const lines = splitLines(original);

    if (operation === "insert") {
        const line = requireNumber(args.line, "line");
        if (line < 1 || line > lines.length + 1) {
            throw new Error(`line must be between 1 and ${lines.length + 1}`);
        }
        lines.splice(line - 1, 0, ...splitLines(getString(args.content, "")));
    } else {
        const startLine = requireNumber(args.startLine, "startLine");
        const endLine = requireNumber(args.endLine, "endLine");
        if (startLine < 1 || endLine < startLine || endLine > lines.length) {
            throw new Error(`line range must be between 1 and ${lines.length}`);
        }
        const replacement =
            operation === "replace"
                ? splitLines(getString(args.content, ""))
                : [];
        lines.splice(startLine - 1, endLine - startLine + 1, ...replacement);
    }

    const updated = lines.join(newline) + (trailingNewline ? newline : "");
    await writeFile(target, updated, "utf8");

    return jsonResult(`Edited ${displayPath(target)}`, {
        path: displayPath(target),
        operation,
        lineCount: lines.length,
    });
}

async function createHomePath(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const target = await resolveCreatablePath(requireString(args.path, "path"));
    const kind = requireString(args.kind, "kind");
    const overwrite = args.overwrite === true;

    if (kind === "directory") {
        await mkdir(target, { recursive: true });
        return jsonResult(`Created folder ${displayPath(target)}`, {
            path: displayPath(target),
            kind,
        });
    }

    if (kind !== "file") {
        throw new Error("kind must be file or directory");
    }

    if (!overwrite && (await pathExists(target))) {
        throw new Error("Path already exists");
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, getString(args.content, ""), {
        encoding: "utf8",
        flag: overwrite ? "w" : "wx",
    });

    return jsonResult(`Created file ${displayPath(target)}`, {
        path: displayPath(target),
        kind,
        bytes: Buffer.byteLength(getString(args.content, ""), "utf8"),
    });
}

async function downloadHomeFile(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const url = requireString(args.url, "url");
    const target = await resolveCreatablePath(requireString(args.path, "path"));
    const overwrite = args.overwrite === true;

    if (!overwrite && (await pathExists(target))) {
        throw new Error("Path already exists");
    }

    const downloaded = await fetchPublicUrlBytes(url, MAX_HOME_DOWNLOAD_BYTES);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(downloaded.bytes), {
        flag: overwrite ? "w" : "wx",
    });

    return jsonResult(`Downloaded ${displayPath(target)}`, {
        path: displayPath(target),
        sourceUrl: downloaded.finalUrl,
        contentType: downloaded.contentType,
        bytes: downloaded.bytes.length,
        overwrite,
    });
}

async function deleteHomePath(
    args: Record<string, unknown>,
): Promise<HomeToolResult> {
    const target = await resolveExistingPath(requireString(args.path, "path"));
    if ((await realHomeDirectory()) === target) {
        throw new Error("Refusing to delete the home directory");
    }

    const recursive = args.recursive === true;
    const info = await lstat(target);
    await rm(target, { recursive, force: false });

    return jsonResult(`Deleted ${displayPath(target)}`, {
        path: displayPath(target),
        kind: pathKind(info),
        recursive,
    });
}

async function calculateDirectorySize(directory: string) {
    let bytes = 0;
    let files = 0;
    let directories = 0;

    async function visit(current: string): Promise<void> {
        const currentStat = await lstat(current);
        if (currentStat.isSymbolicLink()) return;
        if (currentStat.isDirectory()) {
            directories++;
            const children = await readdir(current);
            for (const child of children) {
                await visit(path.join(current, child));
            }
            return;
        }
        if (currentStat.isFile()) {
            files++;
            bytes += currentStat.size;
        }
    }

    await visit(directory);
    return { bytes, files, directories: Math.max(0, directories - 1) };
}

async function searchFileLines(
    filePath: string,
    query: string,
    caseSensitive: boolean,
    maxMatches: number,
    matches: Array<Record<string, unknown>>,
) {
    const needle = caseSensitive ? query : query.toLowerCase();
    const stream = createReadStream(filePath, {
        encoding: "utf8",
        start: 0,
        end: MAX_TEXT_SEARCH_FILE_BYTES - 1,
    });
    const reader = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
    });

    let lineNumber = 0;
    for await (const line of reader) {
        lineNumber++;
        const haystack = caseSensitive ? line : line.toLowerCase();
        if (!haystack.includes(needle)) continue;

        matches.push({
            path: displayPath(filePath),
            line: lineNumber,
            preview: line.slice(0, 500),
        });
        if (matches.length >= maxMatches) {
            reader.close();
            stream.destroy();
            break;
        }
    }
}

async function assertReadableFile(filePath: string) {
    const info = await lstat(filePath);
    if (!info.isFile()) {
        throw new Error("Path is not a file");
    }
}

async function readLimitedTextFile(filePath: string, maxBytes: number) {
    const info = await lstat(filePath);
    const handle = await open(filePath, "r");
    const truncated = info.size > maxBytes;
    const bytesToRead = Math.min(info.size, maxBytes);
    const bytes = Buffer.alloc(bytesToRead);
    try {
        await handle.read(bytes, 0, bytesToRead, 0);
        return {
            content: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
            truncated,
        };
    } finally {
        await handle.close();
    }
}

function toPathEntry(
    filePath: string,
    info: Awaited<ReturnType<typeof lstat>>,
) {
    return {
        path: displayPath(filePath),
        name: path.basename(filePath),
        kind: pathKind(info),
        bytes: info.size,
        createdAt: info.birthtime.toISOString(),
        modifiedAt: info.mtime.toISOString(),
        symlink: info.isSymbolicLink(),
    };
}

function pathKind(info: Awaited<ReturnType<typeof lstat>>) {
    if (info.isDirectory()) return "directory";
    if (info.isFile()) return "file";
    if (info.isSymbolicLink()) return "symlink";
    return "other";
}

async function resolveExistingPath(input: string) {
    const candidate = resolveCandidate(input);
    const resolved = await realpath(candidate);
    await assertInsideHome(resolved);
    return resolved;
}

async function resolveCreatablePath(input: string) {
    const candidate = resolveCandidate(input);
    await assertInsideHome(candidate);
    await assertInsideHome(await nearestExistingAncestor(candidate));
    return candidate;
}

function resolveCandidate(input: string) {
    const home = configuredHomeDirectory();
    const value = input.trim() || ".";
    if (value === "~") return home;
    if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
        return path.resolve(home, value.slice(2));
    }
    return path.resolve(
        path.isAbsolute(value) ? value : path.join(home, value),
    );
}

async function nearestExistingAncestor(target: string) {
    let current = target;
    while (!(await pathExists(current))) {
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return realpath(current);
}

async function realHomeDirectory() {
    return realpath(configuredHomeDirectory());
}

function configuredHomeDirectory() {
    return process.env.LLM_CHAT_HOME_DIR ?? os.homedir();
}

async function assertInsideHome(target: string) {
    const home = await realHomeDirectory();
    const normalizedHome = normalizeForComparison(home);
    const normalizedTarget = normalizeForComparison(target);
    if (
        normalizedTarget !== normalizedHome &&
        !normalizedTarget.startsWith(`${normalizedHome}${path.sep}`)
    ) {
        throw new Error("Path is outside the user's home directory");
    }
}

function displayPath(filePath: string) {
    const home = configuredHomeDirectory();
    const relative = path.relative(home, filePath);
    return relative ? `~${path.sep}${relative}` : "~";
}

function normalizeForComparison(filePath: string) {
    const normalized = path.resolve(filePath);
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function detectImageMimeType(bytes: Buffer) {
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return "image/png";
    }

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        return "image/jpeg";
    }

    const header = bytes.subarray(0, 12).toString("ascii");
    if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) {
        return "image/gif";
    }

    if (
        bytes.length >= 12 &&
        header.startsWith("RIFF") &&
        header.endsWith("WEBP")
    ) {
        return "image/webp";
    }

    if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
        return "image/bmp";
    }

    const brand = bytes.subarray(4, 32).toString("ascii");
    if (brand.includes("ftypavif") || brand.includes("ftypavis")) {
        return "image/avif";
    }

    return undefined;
}

async function pathExists(filePath: string) {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

function jsonResult(summary: string, payload: unknown): HomeToolResult {
    return { summary, content: JSON.stringify(payload, null, 2) };
}

function requireString(value: unknown, name: string) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Missing ${name} parameter`);
    }
    return value;
}

function getString(value: unknown, fallback: string) {
    return typeof value === "string" ? value : fallback;
}

function requireNumber(value: unknown, name: string) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Missing ${name} parameter`);
    }
    return Math.trunc(value);
}

function getOptionalNumber(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return undefined;
    }
    return Math.trunc(value);
}

function clampNumber(value: unknown, min: number, max: number) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return max;
    }
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

function splitLines(text: string) {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    if (normalized.endsWith("\n")) {
        lines.pop();
    }
    return lines;
}
