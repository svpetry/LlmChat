# LLM Chat

Web-based chat client for OpenAI-compatible LLM APIs (llama.cpp, vLLM, LM Studio). Streams chat completions with real-time token display and optional web search tool calls.

## Stack

- TypeScript (ESM), React 19, MUI v7, Jotai, TanStack React Query, Express, sql.js (SQLite WASM), Vite, pnpm

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server (Express on :8000 + Vite with HMR, proxies `/api` to Express) |
| `pnpm build` | Vite frontend build to `dist/` |
| `pnpm start` | Production server (Express serves `dist/` as static) |
| `pnpm test` | Server-side tests with Vitest |
| `pnpm lint` | ESLint on `src/` |
| `pnpm format` | Prettier (4-space tabs) |

## Architecture

```
src/client/          React frontend
  components/        ConnectionDialog, ChatScreen, ChatSettingsDialog
  atoms.ts           Jotai state (connection, messages, streaming, search settings)
  api.ts             Fetch helpers for server API
src/server/          Express backend
  index.ts           Server entry, static serving
  routes.ts          /api/settings, /api/search-settings, /api/models, /api/chat
  search.ts          Brave Search and SearXNG adapters plus web_search tool schema
  database.ts        SQLite settings persistence
```

The server proxies all LLM API calls; the client never sends LLM API keys directly to the upstream endpoint. Chat responses are forwarded as SSE to the frontend.

When web search is enabled, `/api/chat` can advertise the `web_search` tool, execute model-requested searches server-side, stream `tool_call` and `tool_result` SSE events to the client, then continue the chat completion with tool results. Search settings are persisted separately through `/api/search-settings`; Brave API keys and SearXNG URLs stay server-side.

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
