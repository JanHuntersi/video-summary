# Install — VideoSummary

Step-by-step guide for installing the prebuilt macOS app (`.dmg`).

---

## 1. Pick the right DMG

| Your Mac | File |
|---|---|
| Apple Silicon (M1 / M2 / M3 / M4) | `VideoSummary-<version>-arm64.dmg` |
| Intel | runs the arm64 build via Rosetta 2 (or build from source) |

> Not sure? Apple menu → **About This Mac**. If it says "Chip: Apple Mxxx" you're on Apple Silicon, otherwise Intel. Intel Macs: download the same `-arm64.dmg`; macOS will offer to install Rosetta 2 on first launch.

Downloads live on the [Releases page](https://github.com/JanHuntersi/video-summary/releases).

---

## 2. Install the app

1. Double-click the `.dmg` — a window opens showing the `VideoSummary.app` icon.
2. Drag `VideoSummary.app` into the `Applications` folder.
3. Eject the `.dmg` (right-click the disk icon → Eject) and delete the `.dmg` file.

---

## 3. First launch (Gatekeeper)

The app is **not code-signed**, so macOS blocks it on first launch. On newer macOS versions (Sonoma 14+) you'll see a misleading error instead of a normal warning:

> *"VideoSummary is damaged and can't be opened. You should move it to the Trash."*

**The app is not damaged.** macOS is hiding the real reason (unsigned developer) behind this message. Three workarounds, from most reliable to least:

**Option A — `xattr` in Terminal (recommended, always works):**

Open Terminal (Applications → Utilities → Terminal) and run:

```bash
xattr -cr /Applications/VideoSummary.app
```

This clears the `com.apple.quarantine` attribute that macOS attached when you downloaded the file. After this, a normal double-click opens the app. You only need to do it once.

**Option B — right-click → Open (older macOS only, up to ~Ventura):**
1. In Finder, go to `Applications`.
2. **Right-click** `VideoSummary.app` → **Open**.
3. Click **Open** in the confirmation dialog.

**Option C — System Settings (last resort):**
1. Double-click `VideoSummary.app` — you'll see the error.
2. Open **System Settings → Privacy & Security**.
3. Scroll down — a "VideoSummary was blocked…" message appears with an **Open Anyway** button. Click it.
4. Confirm with **Open**.

After the first successful launch (via any method) you can open the app with a normal double-click.

---

## 4. Optional dependencies

The app runs standalone for core features (import, transcription). These are only needed for specific functionality:

### yt-dlp — for importing from YouTube URLs
```bash
brew install yt-dlp
```
(If you don't have Homebrew: https://brew.sh)

### Ollama — for local LLM (summaries, chat)
1. Download from https://ollama.com and install.
2. In Terminal:
   ```bash
   ollama pull llama3
   # or a smaller model:
   ollama pull llama3.2:3b
   ```
3. Ollama runs in the background automatically after install.

### Google Gemini API key — for cloud LLM (free tier available)
1. Go to https://aistudio.google.com/apikey
2. Click **Create API key** → copy it.
3. In the app → Settings → Google Gemini → paste the key → Save key.
   - The key is stored in the macOS Keychain, never in plain text on disk.

---

## 5. First-time setup in the app

1. Open `VideoSummary` from Applications.
2. Click **Settings** in the sidebar.
3. **Library folder** — where videos are stored. Default `~/Videos/VideoSummary/`. You can change it.
4. **Transcription**:
   - Default model: `base` (good speed/quality compromise).
5. **LLM Providers**:
   - **Ollama base URL** — default `http://localhost:11434` works. Click **Test connection**.
   - **Google Gemini** — paste your API key (if you have one). Click **Test**.
6. **Workflow automation** (recommended):
   - ✅ Auto-start transcription after import
   - ✅ Auto-generate summary after transcription _(requires a Default LLM to be set)_
   - **Default LLM** — pick a provider + model (e.g. Ollama + `llama3`).
7. **Prompts** — default system prompts for summary and chat. Edit if you like.

---

## 6. Quick workflow

- **Import a video:** drag an `.mp4 / .mov / .mkv / .webm` file **directly onto the Library** page. Or click `+ New Video` (`⌘N`).
- **YouTube:** New Video → "From URL" → paste link → Fetch info → Download & Import.
- **Transcription** starts automatically (if enabled) — you'll see it in the bottom of the sidebar.
- **Click a video in Library** → Video Detail page with the player, Transcript / Summary / Highlights / Notes / Info tabs, and a chat panel on the right.
- **Click a transcript segment** → the video jumps there and starts playing.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` | Focus Library search |
| `⌘N` | Open New Video |
| `Space` | Play / pause video |
| `J` | Skip back 5s |
| `K` | Skip forward 5s |
| `←` | Previous transcript segment |
| `→` | Next transcript segment |
| `T` | Switch to Transcript tab |
| `Esc` | Close Edit modal |

---

## Where your data lives

- **App settings:** `~/Library/Application Support/VideoSummary/settings.json`
- **Whisper models** (cached): `~/Library/Application Support/VideoSummary/whisper-models/`
- **Logs:** `~/Library/Application Support/VideoSummary/logs/`
- **Videos & transcripts:** in your configured library folder (default `~/Videos/VideoSummary/`).
- **Secrets (Gemini API key):** macOS Keychain (service `VideoSummaryWorkflow`).

---

## Updating

When a new version is released:
1. Download the new `.dmg`.
2. Drag the new `VideoSummary.app` into Applications — confirm **Replace**.
3. Run `xattr -cr /Applications/VideoSummary.app` again (each new download gets quarantined).
4. Your settings and library are preserved (they live in separate folders).

---

## Uninstall

1. Drag `VideoSummary.app` from Applications to Trash.
2. Optionally also delete:
   ```bash
   rm -rf ~/Library/Application\ Support/VideoSummary
   rm -rf ~/Videos/VideoSummary   # only if you don't want your videos anymore
   ```
3. Remove the Gemini key from Keychain (optional): Keychain Access app → search `VideoSummaryWorkflow` → delete.

---

## Troubleshooting

**"VideoSummary is damaged and can't be opened"** (Sonoma+) or **"VideoSummary can't be opened because Apple cannot check it for malicious software"** (older macOS)
→ Gatekeeper is blocking the unsigned app. Run in Terminal: `xattr -cr /Applications/VideoSummary.app`. See step 3 above for all details.

**"Ollama unreachable"**
→ Check that Ollama is installed and running (`ollama list` in Terminal should work). Default URL is `http://localhost:11434`.

**"yt-dlp not installed"**
→ `brew install yt-dlp` in Terminal, then restart the app.

**Video won't play**
→ Close and reopen the app. If the problem persists, file an issue.

**Transcription is slow**
→ Default model is `base` (~140 MB). Smaller = faster but less accurate. For speed pick `tiny`. For better quality use `small` or `medium`.

**Hallucinated transcript segments** (`(music)`, `(applause)`, etc.)
→ Normal. Whisper sometimes emits these "non-speech" labels over silence or noise. The actual speech is still correct.
