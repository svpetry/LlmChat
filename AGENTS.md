# LLM Chat

Web-based chat client for OpenAI-compatible LLM APIs (llama.cpp, vLLM, LM Studio). Streams chat completions with real-time token display.

## Stack

- TypeScript (ESM), React 19, MUI v7, Jotai, TanStack React Query, Express, sql.js (SQLite WASM), Vite, pnpm

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server (Express on :8000 + Vite with HMR, proxies `/api` to Express) |
| `pnpm build` | Vite frontend build → `dist/` |
| `pnpm start` | Production server (Express serves `dist/` as static) |
| `pnpm test` | Server-side tests with Vitest |
| `pnpm lint` | ESLint on `src/` |
| `pnpm format` | Prettier (4-space tabs) |

## Architecture

```
src/client/          React frontend
  components/        ConnectionDialog, ChatScreen
  atoms.ts           Jotai state (connection, messages, streaming)
  api.ts             Fetch helpers for server API
src/server/          Express backend
  index.ts           Server entry, static serving
  routes.ts          /api/settings, /api/models, /api/chat (SSE proxy)
  database.ts        SQLite settings persistence
```

The server proxies all LLM API calls — the client never sends API keys directly to the upstream endpoint. Chat responses are forwarded as SSE to the frontend.

## Key Files

- `vite.config.ts` — Vite config with React plugin and `/api` proxy
- `vitest.config.ts` — Test runner, scoped to `src/server/**/*.test.ts`
- `tsconfig.json` — Server TS config (no DOM)
- `tsconfig.server.json` — Client TS config (DOM + JSX)

## Conventions

- ESM modules throughout (`"type": "module"`)
- Server TypeScript configs exclude client code and vice versa
- Tests mock database and `fetch` with Vitest mocks, use `supertest` for HTTP
- Data directory (`data/settings.db`) is gitignored
