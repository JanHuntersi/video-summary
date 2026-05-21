# Concurrent video import sessions

**Status:** Draft
**Date:** 2026-05-21
**Author:** Brainstormed with Claude

## Context

Today `NewVideo` (`src/renderer/routes/NewVideo.tsx`) is the only path to import a video. It holds the entire import → transcribe → summarize state in local `useState` hooks. If the user navigates away (e.g. clicks Library to look at an older video), the page state is lost — and there is no way back to a partially completed pipeline.

The sidebar (`src/renderer/components/Sidebar.tsx`) already shows a "Processing" section, but it is read-only badges driven by `TranscriptionQueue` (`src/main/transcription/queue.ts`). The user cannot click a queue item, cannot see its progress, and cannot cancel.

Result: the user can only run one pipeline at a time, must stay on `NewVideo` until it finishes (or accept losing progress UI), and has no way to remove a stuck/unwanted job.

This spec promotes the in-flight pipeline state from local component state to a global, addressable **Session** owned by the main process, makes the sidebar interactive, and as a small UX bonus replaces the import-mode checkbox in Settings with radio buttons.

## Goals

1. The user can start a new import while another is still importing/transcribing — multiple Sessions exist concurrently in the sidebar.
2. Clicking a Session in the sidebar opens a dedicated `SessionDetail` page that mirrors the existing 3-stage NewVideo layout but is driven by Session state (so navigation does not lose progress).
3. Each Session row has an `×` button that cancels the underlying work (yt-dlp download or whisper transcription) and removes the Session from the sidebar.
4. Replace the import-mode checkbox in Settings with a 2-option radio (`Copy` / `Move`) so the active mode is visually obvious at a glance.

## Non-goals

- Persisting Sessions across app restarts. Restart drops all in-flight Sessions; the user simply restarts the import. (Out of scope; revisit if it becomes painful.)
- Parallel transcriptions. Whisper is CPU/GPU-heavy and the current single-worker model is the right default — multiple imports can be in flight, but only one transcription runs at a time. Subsequent transcription Sessions sit in `queued` state.
- Resuming a partially-completed download.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Click on Session in sidebar | Open dedicated `SessionDetail` page at `/sessions/:id` mirroring the 3-stage NewVideo layout, driven by Session state from main |
| 2 | Cancel during active transcription | Actually abort whisper work. Implement transcription inside a `worker_thread`; cancel calls `worker.terminate()` |
| 3 | Persistence across app restart | None — Sessions live in main-process memory only |
| 4 | Bundle import-mode UI fix | Yes — radio buttons replace the checkbox in the same spec/commit |

## Architecture

### Main process: `SessionManager`

New module at `src/main/sessions/manager.ts`.

```ts
type SessionStage =
  | 'importing-url'      // yt-dlp downloading
  | 'importing-local'    // copying/remuxing local file
  | 'imported'           // video in library, not yet transcribed
  | 'transcribing'       // whisper running (single-worker — others wait)
  | 'transcribed'        // transcript saved
  | 'summarizing'        // LLM streaming summary
  | 'summarized'         // summary saved
  | 'error'
  | 'cancelled';

interface Session {
  id: string;                  // sess_<short-id>
  title: string;
  stage: SessionStage;
  videoId: string | null;      // null until import completes
  progress: { phase: string; message: string; pct?: number } | null;
  startedAt: string;
  error: string | null;
  // Internal handles for cancellation:
  ytdlpRequestId?: string;
  transcriptionWorker?: Worker;
}
```

`SessionManager` exposes:

- `start(args)` — three variants: `startLocal`, `startUrl`. Returns `Session.id`.
- `getAll(): SessionItem[]` — serializable view (drops internal handles).
- `get(id)`.
- `cancel(id)` — kills the underlying yt-dlp child or `worker.terminate()`s the transcription worker, cleans up partial files, sets stage to `cancelled`, emits change.
- `dismiss(id)` — removes Session from the list. Only allowed for terminal stages (`summarized`, `error`, `cancelled`). For active stages must call `cancel` first.
- `onChange(cb)` — subscription.

The existing `TranscriptionQueue` becomes redundant; transcription work moves into `SessionManager`'s internal scheduler (single-worker semantics preserved).

### Transcription worker thread

New file `src/main/transcription/worker.ts` — a `worker_thread` entrypoint that receives `{ modelPath, audioPath, language }`, runs `transcribe(...)` from `whisper.ts`, posts `progress` and `done` messages back. The main process cancels by `worker.terminate()` — the OS reclaims the in-process whisper resources.

Reason: `smart-whisper` is a native N-API addon with no abort API. A worker thread is the cleanest way to actually kill in-flight work without forking a child process and reloading the model from scratch.

### IPC additions

In `src/main/ipc/sessions.ts` (new):

- `sessions:list` → `SessionItem[]`
- `sessions:get` (id) → `SessionItem | null`
- `sessions:startLocal` ({ sourcePath, title }) → `{ id }`
- `sessions:startUrl` ({ url, title? }) → `{ id }`
- `sessions:cancel` (id) → `void`
- `sessions:dismiss` (id) → `void`
- Event `sessions:changed` → `{ items: SessionItem[] }`

Existing `transcription:start`, `transcription:queueChanged`, `transcription:getQueue`, and `ytdlp:start`/`ytdlp:cancel` calls from NewVideo are replaced by these Session APIs. Inside the main process, SessionManager calls into the existing `crud.importVideo`, ffmpeg `extractWav`, and (now-wrapped) whisper transcription.

### Renderer changes

**`Sidebar.tsx`**

The Processing section now lists Sessions. Each row:

```
<NavLink to={`/sessions/${s.id}`}>
  <span>{s.title}</span>
  <span class="badge">{s.stage}</span>
  <button onClick={cancel}>×</button>
</NavLink>
```

Clicking the row navigates to the SessionDetail page. The `×` button calls `sessions:cancel` for active stages and `sessions:dismiss` for terminal ones (single button, behaviour switches on stage). A confirm prompt fires for `cancel` (not for `dismiss`).

Subscribe to `sessions:changed` instead of `transcription:queueChanged`.

**`NewVideo.tsx` becomes a starter**

The 3-stage UI moves to `SessionDetail.tsx`. `NewVideo` keeps only the initial chooser: pick local file or paste URL, enter title, click Import. On submit it calls `sessions:startLocal` / `sessions:startUrl` and `navigate(\`/sessions/${id}\`)`. The page can then be left immediately; the work continues in main.

**`SessionDetail.tsx` (new)**

Same 3-stage visual layout as today's NewVideo (Stage 1 Import / Stage 2 Transcribe / Stage 3 Summarize). State is hydrated from `sessions:get(id)` on mount and live-updated by `sessions:changed` events. Auto-transcribe / auto-summarize from Settings moves into SessionManager so it works even if the user is not on the SessionDetail page.

**Routing**: add `<Route path="/sessions/:id" element={<SessionDetail />} />` in `App.tsx`.

### Settings: import-mode radio buttons

Replace `Settings.tsx:86-90`:

```tsx
<label className="flex items-center gap-2 mt-3 text-sm">
  <input type="checkbox" checked={settings.importMode === 'move'}
         onChange={e => save({ importMode: e.target.checked ? 'move' : 'copy' })}/>
  Move file on import (default: copy)
</label>
```

with:

```tsx
<fieldset className="mt-3">
  <legend className="text-sm font-medium mb-1.5">Import mode</legend>
  <div className="flex flex-col gap-1.5 text-sm">
    <label className="flex items-center gap-2">
      <input type="radio" name="importMode" value="copy"
             checked={settings.importMode === 'copy'}
             onChange={() => save({ importMode: 'copy' })}/>
      <span>Copy <span className="text-slate-500">— keep originals on disk</span></span>
    </label>
    <label className="flex items-center gap-2">
      <input type="radio" name="importMode" value="move"
             checked={settings.importMode === 'move'}
             onChange={() => save({ importMode: 'move' })}/>
      <span>Move <span className="text-slate-500">— delete originals after import</span></span>
    </label>
  </div>
</fieldset>
```

## Cancel semantics (per stage)

| Stage | Cancel action |
|-------|--------------|
| `importing-url` | Call existing `ytdlp:cancel` → yt-dlp child gets SIGTERM. Partially-downloaded file inside the library folder is removed. Session marked `cancelled`. |
| `importing-local` | Local copy is fast and synchronous (`fs.copyFile`); cancel is best-effort — if the copy has already returned, treat as `imported`. For `.mov` remux the ffmpeg child is killed (already supported in `remuxToMp4`? — verify during implementation; if not, add). |
| `imported` (waiting in queue for whisper) | Just dequeue, mark `cancelled`. Video itself stays in library. |
| `transcribing` | `worker.terminate()`. Delete the temporary `.wav` extraction. Video stays in library at status `imported`. Session marked `cancelled`. |
| `summarizing` | Existing LLM cancel via `activeReq` abort path; transcript stays. Session stage reverts to `transcribed`, not `cancelled`. |
| Terminal stages | `dismiss` removes from sidebar; no underlying work to cancel. |

## Data flow example

1. User clicks "Download & Import" with a URL.
2. `NewVideo` calls `sessions:startUrl({url, title})` → SessionManager creates `Session(stage='importing-url')`, spawns yt-dlp via existing `ytdlp` IPC, wires its progress callback into the Session.
3. `sessions:changed` fires; Sidebar shows the new row; SessionDetail (if open) shows live download progress.
4. yt-dlp completes → SessionManager calls `crud.importVideo(...)`, sets `videoId`, transitions stage to `imported`.
5. If `settings.autoTranscribe` is on and no other Session is currently `transcribing`, SessionManager promotes this Session to `transcribing` and dispatches a transcription worker. Otherwise stays at `imported` until current transcription finishes.
6. Transcription worker streams `progress` → SessionManager updates `session.progress` → `sessions:changed` → UI updates.
7. Transcription done → stage = `transcribed`. If `autoSummarize` + `defaultLlm` is set, transition to `summarizing` and stream summary via existing LLM channel.
8. Summary done → stage = `summarized`. Session stays in sidebar until user dismisses or until app restart.

## Files

**New:**
- `src/main/sessions/manager.ts`
- `src/main/sessions/manager.test.ts`
- `src/main/sessions/scheduler.ts` — single-worker transcription gate (replaces `queue.ts`)
- `src/main/transcription/worker.ts`
- `src/main/ipc/sessions.ts`
- `src/renderer/routes/SessionDetail.tsx`

**Modified:**
- `src/main/ipc/index.ts` — register `sessions` IPC, retire `transcription:start` / queue
- `src/main/ipc/transcription.ts` — collapses into SessionManager wiring, or removed if fully absorbed
- `src/main/ipc/ytdlp.ts` — progress events route through Session id, not per-NewVideo requestId
- `src/main/transcription/whisper.ts` — extract `transcribe` body for worker reuse (no behaviour change)
- `src/preload/index.ts` — expose `sessions` API
- `src/renderer/App.tsx` — add `/sessions/:id` route
- `src/renderer/routes/NewVideo.tsx` — slim down to starter
- `src/renderer/components/Sidebar.tsx` — clickable rows + `×`
- `src/renderer/routes/Settings.tsx` — radio buttons for import mode
- `src/shared/types.ts` — `SessionItem`, `SessionStage`

**Removed (after migration):**
- `src/main/transcription/queue.ts` — behaviour absorbed into `scheduler.ts`

## Verification

Each item is a manual check after implementation:

- [ ] Start a URL import; while it downloads, open Library, then click the Session in the sidebar — SessionDetail shows live download progress.
- [ ] Start two URL imports in a row; both appear in the sidebar; the first transcribes when its download completes, the second waits in `imported` state until the first transcription finishes.
- [ ] Cancel a download mid-flight (`×`) — Session disappears, partial file is gone from the library folder, video does not appear in Library.
- [ ] Cancel a running transcription (`×`) — worker dies, video reverts to `imported` status, `.wav` temp file is cleaned, Session disappears.
- [ ] Cancel a `summarizing` Session — summary stream aborts, transcript stays, Session reverts to `transcribed` (user can retry summary).
- [ ] Dismiss a `summarized` Session — row disappears from sidebar; video stays in Library.
- [ ] Restart app while a Session is `transcribing` — on next launch the Session is gone, the video in Library is back at `imported` status (no orphan `.wav` left in temp).
- [ ] Settings → toggle import mode radio; confirm both values persist across app restart.
- [ ] Run `npm test` — all existing 29 tests still pass; new SessionManager tests cover: queue ordering, cancel during each stage, dismiss validity, scheduler concurrency cap.

## Risks / open questions

- **ffmpeg cancel** for `.mov` remux during `importing-local` — current `remuxToMp4` may not expose a cancel hook. If not, cancel during remux is best-effort (the operation usually finishes within a few seconds anyway).
- **Worker thread + native addon** — verify that `smart-whisper` loads cleanly inside a `worker_thread` on macOS arm64 and that `worker.terminate()` does not leak the loaded model. If problems surface, fall back to spawning a `child_process` running a tiny CLI wrapper; slower startup but easier to kill.
- **Settings auto-flow ergonomics** — auto-transcribe + auto-summarize moving from `NewVideo.tsx` into SessionManager means the Settings toggles affect the next Session, not the currently active one. Document this clearly in the Settings UI.
