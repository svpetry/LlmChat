import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.LLM_CHAT_DATA_DIR = mkdtempSync(join(tmpdir(), "llm-chat-vitest-"));
