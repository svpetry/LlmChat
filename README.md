# LLM Chat

A web-based chat client for OpenAI-compatible LLM APIs. Connect to any server that exposes the `/v1/models` and `/v1/chat/completions` endpoints and chat with streamed responses.

I needed a simple chat client so I could test my local LLM instances. This is the result.

## Features

- Connect to any OpenAI-compatible API (e.g. llama.cpp, vLLM, LM Studio)
- Model selection from the server's available models
- Streaming responses with real-time token display
- Optional web search tool support via Brave Search or SearXNG
- Per-message performance stats (prefill time, tokens/sec, token count)
- Persisted connection and search settings via SQLite

## Web Search

Enable web search from the in-chat settings dialog. When enabled, the server advertises a `web_search` tool to compatible models and handles tool calls by querying either Brave Search or a SearXNG instance. Search credentials and URLs are stored on the server, so the browser never sends them to the upstream LLM API.

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

## Desktop App

The Electron build packages the React frontend, starts the Express server inside
the Electron main process, and opens the app from a local ephemeral port. The
desktop build stores its SQLite settings and chats under Electron's user data
directory.

```sh
pnpm install
pnpm electron
```

Create a Windows installer:

```sh
pnpm dist
```

## Scripts

| Command            | Description                          |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | Start dev server with hot reload     |
| `pnpm build`       | Build for production                 |
| `pnpm build:electron` | Build frontend and Electron main  |
| `pnpm electron`    | Run the desktop app locally          |
| `pnpm dist`        | Build a Windows installer            |
| `pnpm dist:dir`    | Build an unpacked desktop app        |
| `pnpm start`       | Run production server                |
| `pnpm test`        | Run tests                            |
| `pnpm test:watch`  | Run tests in watch mode              |
| `pnpm lint`        | Lint with ESLint                     |
| `pnpm format`      | Format code with Prettier            |
