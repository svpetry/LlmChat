import initSqlJs from "sql.js";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, "settings.db");

const SQL = await initSqlJs();

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

db.run("PRAGMA foreign_keys = ON");

function save() {
    writeFileSync(dbPath, Buffer.from(db.export()));
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
