# Video Summary Workflow — Design Spec

**Date:** 2026-05-12
**Status:** Draft, awaiting user review

## 1. Purpose

A desktop application that lets a user import local video files, transcribe them with Whisper, generate summaries via a local LLM (Ollama) or Google Gemini, and chat with an LLM about a specific video. Each video is a self-contained "mini-project" with persistent transcript, summary, and chat history.

## 2. High-level architecture

Electron app with the standard two-process split:

- **Main process (Node.js):** filesystem I/O, transcription, LLM API calls, library indexing, settings persistence. All heavy/blocking work lives here.
- **Renderer process (React):** UI only. Communicates with main via `ipcRenderer.invoke` for request/response and `ipcRenderer.on` for streaming events (transcription progress, LLM token stream).

**Build tooling:** `electron-vite` for Vite-powered HMR in both main and renderer.

**Frontend stack:**
- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- React Router (HashRouter — Electron friendly)
- Zustand for global state (settings, library list)

**Main process modules:**
- `transcription/` — `smart-whisper` (whisper.cpp Node binding) wrapper, model download/cache, progress callbacks.
- `llm/` — provider abstraction with two implementations: `OllamaProvider`, `GeminiProvider`. Shared interface: `summarize(transcript, systemPrompt, opts)`, `chat(history, userMessage, systemPrompt, opts)`. Both expose streaming.
- `library/` — read/write library folder, index management, reconcile on startup.
- `settings/` — read/write `settings.json` + OS keychain (`keytar`) for secrets.
- `media/` — `ffmpeg-static` wrapper for duration + thumbnail extraction.
- `ipc/` — typed IPC handlers (one file per domain).

## 3. Data layout

User picks a library folder in settings (default `~/Videos/VideoSummary/`). Layout:

```
<library>/
├── _index.json
└── <YYYY-MM-DD>_<slug>_<id>/
    ├── source.mp4           # or .mov/.mkv/.webm
    ├── thumbnail.jpg
    ├── meta.json
    ├── transcript.json
    ├── transcript.txt
    ├── summary.md           # optional, may not exist
    └── chat.json            # optional, may not exist
```

- `_index.json` — fast-load array of `{ id, title, slug, folderName, status, durationSec, createdAt, thumbnailRelPath }`. Rebuilt on every mutation and reconciled with disk on app start.
- `meta.json` — source of truth per video: `{ id, title, originalFilename, sourceRelPath, durationSec, createdAt, status, hash, transcription: { model, language, completedAt }, summary: { provider, model, systemPrompt, generatedAt } }`.
- `transcript.json` — `[{ start: number, end: number, text: string }]` (seconds).
- `chat.json` — `{ messages: [{ role, content, createdAt }], systemPromptUsed }`.

**Status values:** `imported | transcribing | transcribed | summarizing | summarized | error`. (Summary is optional, so `transcribed` is a terminal valid state.)

**App data (separate from library):** `~/Library/Application Support/VideoSummary/`
- `settings.json` — non-secret settings
- `whisper-models/` — cached `.bin` files
- `logs/` — rotating log files
- Secrets (Gemini key) in OS keychain via `keytar`.

## 4. Screens

Sidebar layout, three primary destinations + one full-screen flow.

### 4.1 Library (`/`)
- Grid/list toggle. Card: thumbnail, title, duration, status badge, created date.
- Search by title, filter by status.
- `+ New Video` button → `/new`.
- Click card → `/video/:id`.

### 4.2 Video Detail (`/video/:id`)
Split layout with resizable splitter.

- **Left (default 40%):** HTML5 `<video>` player. Below it, tabs:
  - `Transcript` — list of segments with timestamps; clicking a segment seeks the player; search within transcript.
  - `Summary` — rendered markdown, with "Regenerate" button.
  - `Metadata` — meta.json fields, file path, "Reveal in Finder" link.
- **Right (default 60%):** chat panel. Streamed responses. Top bar: model selector, "Clear chat" button. Input at bottom with send/stop.

### 4.3 Settings (`/settings`)
See section 6.

### 4.4 New Video (`/new`)
Full-screen 3-step wizard with progress bar; see section 5.

## 5. New Video workflow

**Step 1 — Import**
- Drag & drop or file picker. Accepts `.mp4 .mov .mkv .webm`.
- On select: copy (or move, per setting) into library, generate ID + folder name (`YYYY-MM-DD_slug_<6-char-id>`), extract duration + thumbnail via ffmpeg, write `meta.json` with status `imported`, update `_index.json`.
- `Next` enabled when import completes.

**Step 2 — Transcribe**
- Whisper model dropdown: `tiny / base / small / medium / large` (default `base`). Shows "Will download ~X MB" if missing.
- Language: `auto` (default) or explicit choice.
- `Start transcription` → status flips to `transcribing`, progress bar fed by `smart-whisper` segment callbacks.
- On success: writes `transcript.json` + `transcript.txt`, status → `transcribed`.
- User may read transcript in place before `Next`.

**Step 3 — Summarize (optional)**
- Provider dropdown filtered by what's configured in settings (`Ollama` and/or `Gemini`).
- Model dropdown:
  - Ollama: live `/api/tags` fetch.
  - Gemini: hardcoded list (`gemini-2.5-flash`, `gemini-2.5-pro`), updatable in code.
- System prompt: prefilled from settings, editable for this video only.
- `Generate summary` streams into a textarea; user can stop.
- `Save & open` → writes `summary.md`, status → `summarized`, navigate to `/video/:id`.
- `Skip` → navigate to detail without summary.

Errors at any step show a toast and leave the video in its last valid status; user can retry from the detail screen.

## 6. Settings

Single screen, grouped sections.

**Library**
- Library folder path (`Change folder…` native dir picker).
- On import: `Copy file` / `Move file` toggle.

**Transcription**
- Default Whisper model.
- Models folder path (default in app data dir).
- `Download model now` button per model.

**LLM Providers**
- **Ollama**
  - Base URL (default `http://localhost:11434`).
  - `Test connection` → calls `/api/tags`, shows OK + model count or error.
- **Google Gemini**
  - API key (password field, stored in OS keychain).
  - `Test connection` → cheap 1-token call.

**Prompts**
- Summary system prompt (multi-line, default provided, `Reset` button).
- Chat system prompt (multi-line, default provided, `Reset` button).

**About**
- Version, `Open logs folder` button.

Default summary prompt: "You are a helpful assistant that produces a concise structured summary of a video transcript. Include: (1) one-paragraph TL;DR, (2) key bullet points, (3) chapters with timestamps."

Default chat prompt: "You are a helpful assistant answering questions about a specific video. The transcript is provided as context. Cite timestamps (mm:ss) when relevant."

## 7. LLM provider interface

```ts
interface LlmProvider {
  id: 'ollama' | 'gemini';
  listModels(): Promise<string[]>;
  summarize(opts: {
    transcript: string;
    systemPrompt: string;
    model: string;
    signal: AbortSignal;
    onToken: (t: string) => void;
  }): Promise<string>;
  chat(opts: {
    history: { role: 'user' | 'assistant'; content: string }[];
    userMessage: string;
    systemPrompt: string;
    transcriptContext: string;
    model: string;
    signal: AbortSignal;
    onToken: (t: string) => void;
  }): Promise<string>;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
}
```

- **Ollama:** uses HTTP `/api/chat` with `stream: true`.
- **Gemini:** uses `@google/generative-ai` SDK with streaming.

**Context strategy for chat:**
- If transcript token estimate < provider context limit minus headroom: include full transcript.
- Otherwise: include `summary.md` (if it exists) instead; if no summary exists, include a truncated transcript with a note. Token estimation: char-count / 4 heuristic, no tokenizer dependency.
- Gemini 2.5 Flash has a 1M token window, so realistically only Ollama (small models) ever hits the truncation branch.

## 8. Error handling & edge cases

- **Whisper model download fail** → retry 3× with exponential backoff, then error toast with `Open logs` link.
- **Ollama unreachable** → friendly error in Summarize step with deep-link to Settings.
- **Gemini 429** → error toast "Rate limit"; chat input disabled for 60s.
- **Crash mid-transcription** → startup reconciler flips any `transcribing` (without `transcript.json`) back to `imported`. Resumable, not corrupted.
- **User deletes folder manually** → startup reconciler drops the entry from `_index.json` without crashing; missing files surface as a non-blocking warning in detail view.
- **Large transcripts** → fall back to summary-as-context (section 7).
- **Concurrency** — single global transcription queue (one job at a time). Summaries and chats may run concurrently across different videos.
- **Long videos** — no hard cap; UI shows a warning for > 2h ("Transcription may take ~N minutes").
- **Duplicate import** — hash check on import; if hash matches an existing entry, prompt user (skip / import anyway).

## 9. Testing strategy

- Main-process module unit tests with Vitest (transcription wrapper mocked, LLM providers mocked via fetch interceptor).
- IPC contract tests: each handler invoked with valid + invalid input.
- Renderer component tests with Vitest + React Testing Library for non-trivial UI (wizard state machine, video detail tab switching, settings form validation).
- Manual smoke test checklist for the end-to-end flow (import → transcribe → summarize → chat) since real Whisper + Ollama can't run in CI cheaply.

## 10. Out of scope (for v1)

- Cloud sync / multi-device.
- Multiple users / accounts.
- YouTube / URL import (only local files).
- Other LLM providers beyond Ollama and Gemini.
- Other transcription engines.
- Editing transcripts.
- Exporting subtitles (SRT/VTT) — easy to add later from `transcript.json`.
- Auto-update of the app.

## 11. Open questions

None at design time. Implementation plan will surface concrete library version choices.
