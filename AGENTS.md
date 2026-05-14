# LLM Chat

Web-based chat client for OpenAI-compatible LLM APIs (llama.cpp, vLLM, LM Studio). Streams chat completions with real-time token display, optional web search, file access, memory, and command execution tools. Also available as an Electron desktop app.

## Stack

- TypeScript (ESM), React 19, MUI v7, Jotai, TanStack React Query, Express, sql.js (SQLite WASM), Vite, pnpm, Electron

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server (Express on :8000 + Vite with HMR, proxies `/api` to Express) |
| `pnpm build` | Vite frontend build to `dist/` |
| `pnpm build:electron` | Build frontend and Electron main process |
| `pnpm electron` | Run the Electron desktop app locally |
| `pnpm dist` | Build a Windows installer (NSIS) |
| `pnpm dist:dir` | Build an unpacked desktop app |
| `pnpm start` | Production server (Express serves `dist/` as static) |
| `pnpm test` | Server-side tests with Vitest |
| `pnpm test:watch` | Tests in watch mode |
| `pnpm lint` | ESLint on `src/` |
| `pnpm format` | Prettier (4-space tabs) |

## Architecture

```
src/client/              React frontend
  components/
    ChatScreen.tsx       Main chat interface
    ChatSidebar.tsx      Chat history sidebar
    ChatSettingsDialog.tsx  Settings for tools and features
    ConnectionDialog.tsx API connection setup
    MessageBox.tsx       Individual message display (with thinking, tools, stats)
    chatUtils.ts         Helper functions for message rendering
  atoms.ts               Jotai state (connection, messages, streaming, search, tools)
  api.ts                 Fetch helpers for server API
src/server/              Express backend
  index.ts               Server entry, static serving
  routes/
    index.ts             Route aggregation
    chat-completion.ts   /api/chat — SSE streaming with multi-iteration tool loops
    chats.ts             /api/chats — Chat CRUD
    models.ts            /api/models
    settings.ts          /api/settings, /api/search-settings
  database.ts            SQLite persistence (settings, chats, messages, memories)
  search.ts              web_search and read_website tools, Brave/SearXNG adapters
  fileAccess.ts          10 home directory file access tools
  memory.ts              6 memory management tools (CRUD + search)
  execute.ts             execute_command tool (shell command execution)
src/electron/
  main.ts                Electron main process (Express on ephemeral port)
scripts/                 Build scripts for Electron packaging
```

The server proxies all LLM API calls; the client never sends LLM API keys directly to the upstream endpoint. Chat responses are forwarded as SSE to the frontend.

Tool calls use a multi-iteration loop (up to 5 rounds): the server advertises enabled tools, the model requests tool calls, the server executes them server-side, streams `tool_call` and `tool_result` SSE events to the client, then continues the chat completion with tool results. Tools are enabled per-session from the ChatSettingsDialog.

### Tool Categories

- **Web search** (`web_search`): Query Brave Search or SearXNG
- **Website reading** (`read_website`): Fetch and display content from URLs
- **File access** (10 tools): List, read, edit, create, delete, search, and download files in the user's home directory; display images
- **Memory** (6 tools): Store, search, list, update, delete, and clear persistent user memories
- **Command execution** (`execute_command`): Run shell commands in the user's home directory

### Database Schema

SQLite tables: `settings` (key-value), `chats` (id, title, model, timestamps), `messages` (id, chat_id, role, content, thinking, tool_calls, tool_results, stats, timestamps), `memories` (id, content, importance, timestamps).

## Key Files

- `vite.config.ts` - Vite config with React plugin and `/api` proxy
- `vitest.config.ts` - Test runner, scoped to `src/server/**/*.test.ts`
- `tsconfig.json` - Server TS config (no DOM)
- `tsconfig.server.json` - Client TS config (DOM + JSX)

## Conventions

- ESM modules throughout (`"type": "module"`)
- Server TypeScript configs exclude client code and vice versa
- Tests mock database, search adapters, and `fetch` with Vitest mocks; use `supertest` for HTTP
- Data directory (`data/settings.db`) is gitignored
- Electron stores data under Electron's userData directory
