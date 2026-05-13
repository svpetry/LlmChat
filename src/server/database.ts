import initSqlJs from "sql.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env.LLM_CHAT_DATA_DIR ?? join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, "settings.db");

const sqlJsWasmPath = process.env.LLM_CHAT_SQLJS_WASM_PATH;
const SQL = await initSqlJs(
    sqlJsWasmPath ? { locateFile: () => sqlJsWasmPath } : undefined,
);

let db: initSqlJs.Database;

if (existsSync(dbPath)) {
    db = new SQL.Database(readFileSync(dbPath));
} else {
    db = new SQL.Database();
}

db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    model TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    thinking TEXT,
    tool_calls TEXT,
    tool_results TEXT,
    stats TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 3,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

ensureColumn("memories", "importance", "INTEGER NOT NULL DEFAULT 3");

db.run("PRAGMA foreign_keys = ON");

function save() {
    writeFileSync(dbPath, Buffer.from(db.export()));
}

function ensureColumn(table: string, column: string, definition: string) {
    const result = db.exec(`PRAGMA table_info(${table})`);
    const hasColumn = result[0]?.values.some((row) => row[1] === column);
    if (!hasColumn) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        save();
    }
}

export function getSetting(key: string): string | undefined {
    const result = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
    if (result.length === 0 || result[0].values.length === 0) return undefined;
    return result[0].values[0][0] as string;
}

export function setSetting(key: string, value: string): void {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
        key,
        value,
    ]);
    save();
}

export function getAllSettings(): Record<string, string> {
    const result = db.exec("SELECT key, value FROM settings");
    const settings: Record<string, string> = {};
    if (result.length > 0) {
        for (const row of result[0].values) {
            settings[row[0] as string] = row[1] as string;
        }
    }
    return settings;
}

// --- Chat CRUD ---

export interface ChatRow {
    id: string;
    title: string;
    model: string;
    created_at: number;
    updated_at: number;
}

export function createChat(id: string, model: string): ChatRow {
    const now = Date.now();
    db.run(
        "INSERT INTO chats (id, title, model, created_at, updated_at) VALUES (?, 'New Chat', ?, ?, ?)",
        [id, model, now, now],
    );
    save();
    return { id, title: "New Chat", model, created_at: now, updated_at: now };
}

export function getChat(id: string): ChatRow | undefined {
    const result = db.exec(
        "SELECT id, title, model, created_at, updated_at FROM chats WHERE id = ?",
        [id],
    );
    if (result.length === 0 || result[0].values.length === 0) return undefined;
    const row = result[0].values[0];
    return {
        id: row[0] as string,
        title: row[1] as string,
        model: row[2] as string,
        created_at: row[3] as number,
        updated_at: row[4] as number,
    };
}

export function updateChatTitle(id: string, title: string): void {
    db.run("UPDATE chats SET title = ?, updated_at = ? WHERE id = ?", [
        title,
        Date.now(),
        id,
    ]);
    save();
}

export function updateChatTimestamp(id: string): void {
    db.run("UPDATE chats SET updated_at = ? WHERE id = ?", [Date.now(), id]);
    save();
}

export function deleteChat(id: string): void {
    db.run("DELETE FROM messages WHERE chat_id = ?", [id]);
    db.run("DELETE FROM chats WHERE id = ?", [id]);
    save();
}

export function listChats(): ChatRow[] {
    const result = db.exec(
        "SELECT id, title, model, created_at, updated_at FROM chats ORDER BY updated_at DESC",
    );
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
        id: row[0] as string,
        title: row[1] as string,
        model: row[2] as string,
        created_at: row[3] as number,
        updated_at: row[4] as number,
    }));
}

// --- Message CRUD ---

export interface MessageRow {
    id: string;
    chat_id: string;
    role: string;
    content: string;
    thinking?: string;
    tool_calls?: string;
    tool_results?: string;
    stats?: string;
    created_at: number;
}

export function createMessage(msg: MessageRow): void {
    db.run(
        "INSERT INTO messages (id, chat_id, role, content, thinking, tool_calls, tool_results, stats, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
            msg.id,
            msg.chat_id,
            msg.role,
            msg.content,
            msg.thinking ?? null,
            msg.tool_calls ?? null,
            msg.tool_results ?? null,
            msg.stats ?? null,
            msg.created_at,
        ],
    );
    save();
}

export function getMessagesByChat(chatId: string): MessageRow[] {
    const result = db.exec(
        "SELECT id, chat_id, role, content, thinking, tool_calls, tool_results, stats, created_at FROM messages WHERE chat_id = ? ORDER BY created_at",
        [chatId],
    );
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
        id: row[0] as string,
        chat_id: row[1] as string,
        role: row[2] as string,
        content: row[3] as string,
        thinking: (row[4] as string) || undefined,
        tool_calls: (row[5] as string) || undefined,
        tool_results: (row[6] as string) || undefined,
        stats: (row[7] as string) || undefined,
        created_at: row[8] as number,
    }));
}

// --- Memory CRUD ---

export interface MemoryRow {
    id: string;
    content: string;
    importance: number;
    created_at: number;
    updated_at: number;
}

export function createMemory(
    id: string,
    content: string,
    importance = 3,
): MemoryRow {
    const now = Date.now();
    db.run(
        "INSERT INTO memories (id, content, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        [id, content, normalizeImportance(importance), now, now],
    );
    save();
    return {
        id,
        content,
        importance: normalizeImportance(importance),
        created_at: now,
        updated_at: now,
    };
}

export function searchMemories(query: string, limit = 10): MemoryRow[] {
    const normalizedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
    return listMemories(1_000)
        .map((memory) => ({
            memory,
            score: scoreMemorySearch(query, memory),
        }))
        .filter((result) => result.score > 0)
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.memory.updated_at - a.memory.updated_at;
        })
        .slice(0, normalizedLimit)
        .map((result) => result.memory);
}

export function listMemories(limit = 50): MemoryRow[] {
    const normalizedLimit = Math.max(1, Math.min(1_000, Math.trunc(limit)));
    const result = db.exec(
        "SELECT id, content, importance, created_at, updated_at FROM memories ORDER BY updated_at DESC LIMIT ?",
        [normalizedLimit],
    );
    return memoryRowsFromResult(result);
}

export function getMemory(id: string): MemoryRow | undefined {
    const result = db.exec(
        "SELECT id, content, importance, created_at, updated_at FROM memories WHERE id = ?",
        [id],
    );
    return memoryRowsFromResult(result)[0];
}

export function updateMemory(
    id: string,
    content: string,
    importance?: number,
): MemoryRow | undefined {
    const existing = getMemory(id);
    if (!existing) return undefined;

    const updatedImportance =
        importance === undefined
            ? existing.importance
            : normalizeImportance(importance);
    const updatedAt = Date.now();
    db.run(
        "UPDATE memories SET content = ?, importance = ?, updated_at = ? WHERE id = ?",
        [content, updatedImportance, updatedAt, id],
    );
    save();
    return {
        ...existing,
        content,
        importance: updatedImportance,
        updated_at: updatedAt,
    };
}

export function deleteMemory(id: string): boolean {
    const existing = getMemory(id);
    if (!existing) return false;
    db.run("DELETE FROM memories WHERE id = ?", [id]);
    save();
    return true;
}

export function clearMemories(): number {
    const count = listMemories(1_000).length;
    db.run("DELETE FROM memories");
    save();
    return count;
}

function memoryRowsFromResult(result: initSqlJs.QueryExecResult[]) {
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
        id: row[0] as string,
        content: row[1] as string,
        importance: row[2] as number,
        created_at: row[3] as number,
        updated_at: row[4] as number,
    }));
}

function normalizeImportance(value: number) {
    if (!Number.isFinite(value)) return 3;
    return Math.max(1, Math.min(5, Math.trunc(value)));
}

function scoreMemorySearch(query: string, memory: MemoryRow) {
    const queryTokens = expandTokens(tokenize(query));
    const contentTokens = new Set(expandTokens(tokenize(memory.content)));
    if (queryTokens.length === 0) return 0;

    const normalizedQuery = normalizeSearchText(query);
    const normalizedContent = normalizeSearchText(memory.content);
    let score = normalizedContent.includes(normalizedQuery) ? 10 : 0;

    for (const queryToken of queryTokens) {
        if (contentTokens.has(queryToken)) {
            score += 3;
            continue;
        }
        if (
            Array.from(contentTokens).some((contentToken) =>
                isNearTokenMatch(queryToken, contentToken),
            )
        ) {
            score += 1;
        }
    }

    if (score === 0) return 0;

    const ageDays = Math.max(0, (Date.now() - memory.updated_at) / 86_400_000);
    const recencyBoost = 1 / (1 + ageDays / 30);
    return score + memory.importance * 0.5 + recencyBoost;
}

function normalizeSearchText(value: string) {
    return tokenize(value).join(" ");
}

function tokenize(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .map(stemToken)
        .filter(Boolean);
}

function stemToken(token: string) {
    return token.replace(/(?:ing|ers|er|ed|es|s)$/u, "");
}

function expandTokens(tokens: string[]) {
    const expanded = new Set(tokens);
    for (const token of tokens) {
        for (const group of RELATED_TERMS) {
            if (group.includes(token)) {
                group.forEach((term) => expanded.add(term));
            }
        }
    }
    return Array.from(expanded);
}

function isNearTokenMatch(left: string, right: string) {
    if (left.length < 5 || right.length < 5) return false;
    if (left.includes(right) || right.includes(left)) return true;
    return levenshteinDistance(left, right) <= 1;
}

function levenshteinDistance(left: string, right: string) {
    const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
    for (let i = 1; i <= left.length; i++) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= right.length; j++) {
            const saved = previous[j];
            previous[j] = Math.min(
                previous[j] + 1,
                previous[j - 1] + 1,
                diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
            );
            diagonal = saved;
        }
    }
    return previous[right.length];
}

const RELATED_TERMS = [
    ["coffee", "espresso", "latte", "cappuccino", "americano", "cafe"],
    ["tea", "matcha", "chai"],
    ["preference", "prefer", "like", "love", "favorite", "favourite"],
    ["city", "town", "location", "home", "live", "moved"],
    ["job", "work", "role", "career", "profession"],
    ["name", "called", "nickname"],
] as const;
