# VideoSummary

> **Status: active development.** This is a personal project being built in the open — expect rough edges, breaking changes, and missing polish. Feedback and issues welcome.

A local-first desktop app (Electron) for turning videos into searchable transcripts, summaries, and chat. Import a local file or a YouTube URL, transcribe it locally with Whisper, then summarize and chat about the contents using your own Ollama instance or Google Gemini key.

**Bring your own tokens.** Nothing is sent anywhere unless you explicitly configure a cloud provider. Gemini API keys are stored in your OS keychain, not on disk.

---

## Features

- **Local & YouTube import** — drag a video onto the Library, or paste a YouTube URL
- **Local Whisper transcription** (whisper.cpp via `smart-whisper`) — models `tiny / base / small / medium / large` are downloaded on first use
- **LLM providers** — Ollama (local) or Google Gemini (cloud, your key)
- **Multi-chat per video** — every video has unlimited renamable / deletable chats
- **Tags & notes** — chip input with autocomplete, tag filter in Library
- **Cross-video search** — searches titles, tags, and transcript text; click jumps to the exact timestamp
- **Auto-flow** — optional auto-transcribe on import and auto-summarize on transcription finish
- **Quick actions** — "Quick summary" and "Highlights" buttons on the video page
- **Sidebar queue** — see which transcription is currently running
- **Toast notifications** for errors (Ollama unreachable, transcription failed, etc.)
- **Live segment highlight** with auto-scroll while playing
- **Custom protocol** `vswfile://` with range-request support (video seeking works)

---

## Platform support

The app builds for the following targets (see `package.json` → `build`):

| Platform | Architecture | Format |
|---|---|---|
| macOS | Apple Silicon (arm64) | `.dmg`, `.zip` |
| Windows | x64 | NSIS installer |
| Linux | x64 | AppImage |

> Intel-native macOS binaries aren't shipped from CI (GitHub free-tier Intel runners have prohibitive queue times). Intel Macs can run the arm64 build via Rosetta 2, or build from source — see `Development` below.

> **Tested on:** macOS (Apple Silicon). Windows and Linux builds are configured but have **not been smoke-tested** by the author yet — please report issues if you try them.

The app is **not code-signed** on any platform.

**macOS Gatekeeper bypass (required on first launch).** Because the app is unsigned, macOS quarantines it and shows *"VideoSummary is damaged and can't be opened"* on the first launch. This is misleading — the app is fine. After moving it to `/Applications`, run **once** in Terminal:

```bash
xattr -cr /Applications/VideoSummary.app
```

This clears the quarantine attribute that macOS attaches to downloaded files. Then double-click to open normally. See `INSTALL.md` for full step-by-step instructions and alternative methods.

---

## Prerequisites

| Dependency | Required | Install |
|---|---|---|
| Node.js 20+ | yes (for dev/build) | https://nodejs.org or `brew install node` |
| ffmpeg | bundled automatically | via `ffmpeg-static` |
| yt-dlp | only for YouTube imports | `brew install yt-dlp` or `pip install yt-dlp` |
| Ollama | only if you want a local LLM | https://ollama.com → `ollama pull llama3` |
| Gemini API key | only if you want cloud LLM | https://aistudio.google.com/apikey (free tier available) |

---

## Quick start (dev)

```bash
git clone <this-repo>
cd VIDEO_SUMMARY_WORKFLOW
npm install
npm run dev
```

Then open **Settings** and configure:

1. **Library folder** — where videos are stored (default `~/Videos/VideoSummary/`)
2. **Whisper default model** — `base` is a good speed/quality compromise
3. **Ollama base URL** — defaults to `http://localhost:11434`
4. **Gemini API key** — paste to enable Gemini (stored in OS keychain)
5. **Workflow automation** — toggle `Auto-transcribe` and/or `Auto-summarize` for one-click flow
6. **Default LLM** — pick provider + model for the "Quick summary" button and auto-summarize

---

## Typical workflow

### Import a video

**Fastest:** drag an `.mp4 / .mov / .mkv / .webm` file directly onto the Library page.

**Or:** click `+ New Video` (or `⌘N`):

- **Local file** — pick a file, enter a title
- **From URL** — paste a YouTube link, click "Fetch info", confirm the title, "Download & Import"

If `Auto-transcribe` is on, transcription starts immediately.

### Transcription

- Whisper auto-downloads the model if missing (~140 MB for `base`)
- Progress is shown in the wizard and the sidebar
- When finished, the transcript is saved to `<library>/<video-folder>/transcript.json` + `.txt`

### Summarize

Three ways:
- **Wizard step 3** during import
- **Quick summary** button in the Video Detail header (uses the default LLM)
- **Regenerate** in the Summary tab

### Chat about the video

Right panel on the Video Detail page — multi-chat:
- **+** for a new chat
- **dropdown** to switch between chats
- **pencil** to rename
- **trash** to delete

Chat history + system prompt are persisted in `<video-folder>/chats/<chat-id>.json`.

### Highlights tab

Click **"Highlights"** in the header → the LLM extracts 5–10 key moments with timestamps. The result is stored as a dedicated chat titled "Highlights" (also visible in the chat dropdown).

---

## Keyboard shortcuts

### Global
| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Focus the Library search bar |
| `⌘N` / `Ctrl+N` | Open New Video |

### In Video Detail
| Key | Action |
|---|---|
| `Space` | Play / pause |
| `J` | Skip back 5s |
| `K` | Skip forward 5s |
| `←` | Previous transcript segment |
| `→` | Next transcript segment |
| `T` | Switch to Transcript tab |
| `Esc` | Close Edit modal |

> Shortcuts only fire when an input field is not focused.

---

## On-disk layout

```
<library>/                                  ← user-configured folder (Settings)
├── _index.json                             ← cache for fast Library load
└── 2026-05-13_video-title_a3f9b1/
    ├── source.mp4                          ← original video
    ├── thumbnail.jpg                       ← extracted middle frame
    ├── meta.json                           ← title, tags, notes, status…
    ├── transcript.json                     ← segments with timestamps
    ├── transcript.txt                      ← plain text
    ├── summary.md                          ← markdown summary (if generated)
    └── chats/
        ├── chat-abc.json
        └── chat-def.json
```

App data:
```
~/Library/Application Support/VideoSummary/  (macOS)
├── settings.json                           ← non-secret settings
└── whisper-models/                         ← cached .bin models
```

Secrets (Gemini API key) live in the OS keychain, **not** in `settings.json`.

---

## Cross-video search

In the Library search — type ≥ 3 characters:
- Searches **titles**, **tags**, and **transcript content**
- Shows a "Transcript matches" section with thumbnail + snippet + timestamp
- Clicking a snippet **opens the video at that exact timestamp** (deep-link `?t=<sec>`)

---

## Troubleshooting

**Video won't play / can't seek**
→ The `vswfile://` protocol should support range requests. Restart the app. If still broken, file an issue.

**Transcript timestamps are wrong**
→ Probably an old transcript made before the `smart-whisper` ms-vs-cs fix. Edit → Delete video, then re-import + re-transcribe.

**"Ollama unreachable"**
→ Run `ollama serve` or check the `http://localhost:11434` URL in Settings.

**"yt-dlp not installed"**
→ `brew install yt-dlp` or `pip install yt-dlp`.

**Whisper model download fails**
→ Check your internet, restart. Models live in `~/Library/Application Support/VideoSummary/whisper-models/`.

**Hallucinations in transcript** (segments like `(music)`, `(applause)` with long durations)
→ Whisper sometimes hallucinates over silence or noise. Speech content is still fine; only the non-speech segments are estimated.

---

## Development

```bash
npm run dev          # Electron + Vite with HMR
npm run typecheck    # tsc --noEmit
npm test             # vitest
npm run build        # electron-vite build
npm run package      # electron-builder → dist/
```

**Stack:** Electron 32 · React 18 · TypeScript · Vite (electron-vite) · Tailwind · shadcn-style components · Zustand · React Router · Vitest · smart-whisper (whisper.cpp) · ffmpeg-static · keytar · @google/generative-ai · mime-types.

---

## Privacy

- All transcription runs **locally** via whisper.cpp.
- Video files never leave your machine unless you explicitly use a cloud LLM provider.
- When using Gemini, only the text sent in chat / summary prompts is transmitted to Google — never the video or audio.
- The Gemini API key is stored in the OS keychain (Keychain on macOS, Credential Manager on Windows, libsecret on Linux) via `keytar`.

---

## Contributing

This is an early-stage personal project, but PRs and issues are welcome. Please open an issue before working on a larger change so we can align on scope.

---

## License

License: TBD — to be decided before a tagged release. Until then, treat the code as "all rights reserved" by the author.
