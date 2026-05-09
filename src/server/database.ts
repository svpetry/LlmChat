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
