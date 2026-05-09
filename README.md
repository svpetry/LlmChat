# LLM Chat

A web-based chat client for OpenAI-compatible LLM APIs. Connect to any server that exposes the `/v1/models` and `/v1/chat/completions` endpoints and chat with streamed responses.

## Features

- Connect to any OpenAI-compatible API (e.g. llama.cpp, vLLM, LM Studio)
- Model selection from the server's available models
- Streaming responses with real-time token display
- Per-message performance stats (prefill time, tokens/sec, token count)
- Persisted connection settings via SQLite

## Tech Stack

- **Frontend:** React 19, TypeScript, MUI, Jotai, TanStack React Query
- **Backend:** Express, sql.js (SQLite)
- **Build:** Vite, pnpm

## Getting Started

```sh
pnpm install
pnpm dev
```

The app runs at `http://localhost:8000`.

## Scripts

| Command            | Description                          |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | Start dev server with hot reload     |
| `pnpm build`       | Build for production                 |
| `pnpm start`       | Run production server                |
| `pnpm test`        | Run tests                            |
| `pnpm test:watch`  | Run tests in watch mode              |
| `pnpm lint`        | Lint with ESLint                     |
| `pnpm format`      | Format code with Prettier            |
