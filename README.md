# LLM Chat

A web-based and desktop chat client for OpenAI-compatible LLM APIs. Connect to any server that exposes the `/v1/models` and `/v1/chat/completions` endpoints and chat with streamed responses. Supports a rich set of tools including web search, file access, memory, and command execution.

I needed a simple chat client so I could test my local LLM instances. This is the result.

## Features

- Connect to any OpenAI-compatible API (e.g. llama.cpp, vLLM, LM Studio)
- Model selection from the server's available models
- Streaming responses with real-time token display
- Persistent chat history with sidebar navigation
- Per-message performance stats (prefill time, tokens/sec, token count)
- Thinking/reasoning content display for compatible models
- LaTeX math rendering
- Electron desktop app packaging (Windows installer)
- Persisted connection and search settings via SQLite

## Tools

Tools are enabled per-session from the in-chat settings dialog. When enabled, the server advertises them to the model and executes tool calls server-side. Tool calls and results are streamed to the client via SSE, with support for multi-iteration tool loops (up to 5 rounds).

### Web Search

Search the web using Brave Search or SearXNG. Search credentials and URLs are stored on the server only.

### Website Reading

Fetch and display content from public URLs, including image downloads.

### File Access

Read, edit, create, delete, search, and download files in the user's home directory. Display images directly in chat.

### Memory

Store, search, list, update, and delete persistent user memories. The model can recall preferences and context across conversations.

### Command Execution

Execute shell commands in the user's home directory and view the output in chat.

## Tech Stack

- **Frontend:** React 19, TypeScript, MUI v7, Jotai, TanStack React Query
- **Backend:** Express, sql.js (SQLite WASM)
- **Desktop:** Electron
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
