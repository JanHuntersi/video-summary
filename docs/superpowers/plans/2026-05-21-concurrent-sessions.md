# Concurrent video import sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the in-flight import/transcribe/summarize pipeline from local `NewVideo` state into a global `Session` owned by the main process, so the user can run multiple imports concurrently, click into any of them from the sidebar, and cancel/dismiss them per row.

**Architecture:** A new `SessionManager` in the main process holds an in-memory list of `Session`s, exposes IPC for list/get/start/cancel/dismiss, and emits a single `sessions:changed` event. Transcription work moves into a `worker_thread` so cancel can actually kill in-flight whisper. The renderer adds a `/sessions/:id` route mirroring the existing 3-stage NewVideo layout, the sidebar becomes interactive, and `NewVideo` shrinks to a starter form. As a small UX bonus, the import-mode checkbox in Settings becomes a 2-option radio.

**Tech Stack:** Electron + electron-vite, TypeScript, React (renderer), React Router, Vitest. `smart-whisper` for transcription, `yt-dlp` for URL downloads (existing).

**Spec:** [`docs/superpowers/specs/2026-05-21-concurrent-sessions-design.md`](../specs/2026-05-21-concurrent-sessions-design.md)

---

## File map

**New files:**
- `src/main/sessions/manager.ts` — `SessionManager` class, holds state, orchestrates pipelines, emits change events
- `src/main/sessions/manager.test.ts` — vitest unit tests
- `src/main/sessions/scheduler.ts` — single-worker gate for transcription stage (replaces `queue.ts`)
- `src/main/sessions/scheduler.test.ts`
- `src/main/transcription/transcribe-worker.ts` — `worker_thread` entrypoint that runs `transcribe()` and posts progress/done back
- `src/main/transcription/transcribe-host.ts` — main-thread wrapper that spawns the worker and exposes `start(...)` + `cancel()` with the same semantic as before
- `src/main/ipc/sessions.ts` — `sessions:*` IPC handlers
- `src/renderer/routes/SessionDetail.tsx` — `/sessions/:id` route with 3-stage live view

**Modified files:**
- `src/shared/types.ts` — add `SessionStage`, `SessionItem`
- `src/main/ipc/index.ts` — register `sessions` IPC, drop `transcription:start` queue events
- `src/main/ipc/transcription.ts` — keep `extractWav` helper, route transcription through SessionManager
- `src/main/ipc/ytdlp.ts` — no API change; SessionManager subscribes to its progress/done/error from main side (not via IPC events)
- `src/preload/index.ts` — expose `sessions` API; remove old `transcription.start` / `getQueue` / `onQueueChanged`
- `src/renderer/App.tsx` — add `/sessions/:id` route
- `src/renderer/routes/NewVideo.tsx` — slim to starter form; dispatch `sessions:startLocal` / `sessions:startUrl`
- `src/renderer/components/Sidebar.tsx` — clickable rows, per-row × button, subscribe to `sessions:changed`
- `src/renderer/routes/Settings.tsx` — import-mode radios

**Removed files (after migration):**
- `src/main/transcription/queue.ts`
- `src/main/transcription/queue.test.ts`

---

## Task 1: Session types + SessionManager skeleton

**Files:**
- Create: `src/shared/types.ts` (modify — add types)
- Create: `src/main/sessions/manager.ts`
- Create: `src/main/sessions/manager.test.ts`

- [ ] **Step 1: Add Session types to `src/shared/types.ts`**

Append to the end of `src/shared/types.ts`:

```ts
export type SessionStage =
  | 'importing-url'
  | 'importing-local'
  | 'imported'
  | 'transcribing'
  | 'transcribed'
  | 'summarizing'
  | 'summarized'
  | 'error'
  | 'cancelled';

export interface SessionProgress {
  phase: string;
  message: string;
  pct?: number;
}

export interface SessionItem {
  id: string;
  title: string;
  stage: SessionStage;
  videoId: string | null;
  progress: SessionProgress | null;
  startedAt: string;
  error: string | null;
}
```

- [ ] **Step 2: Write the failing test `src/main/sessions/manager.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { SessionManager } from './manager';

describe('SessionManager — state store', () => {
  it('creates an empty list', () => {
    const m = new SessionManager();
    expect(m.getAll()).toEqual([]);
  });

  it('adds and retrieves a session by id', () => {
    const m = new SessionManager();
    const id = m.createForTest({ title: 'Hello', stage: 'imported' });
    expect(m.get(id)?.title).toBe('Hello');
    expect(m.getAll().length).toBe(1);
  });

  it('emits change events on create', () => {
    const m = new SessionManager();
    let calls = 0;
    m.onChange(() => calls++);
    m.createForTest({ title: 'A', stage: 'imported' });
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- src/main/sessions/manager.test.ts
```

Expected: FAIL with "Cannot find module './manager'".

- [ ] **Step 4: Write minimal `src/main/sessions/manager.ts`**

```ts
import { randomBytes } from 'crypto';
import type { SessionItem, SessionStage, SessionProgress } from '@shared/types';

interface InternalSession extends SessionItem {
  // Internal handles set by orchestration methods later. Kept off the public type.
  ytdlpRequestId?: string;
  cancelTranscription?: () => void;
}

function makeId() {
  return 'sess_' + randomBytes(4).toString('hex');
}

export class SessionManager {
  private sessions = new Map<string, InternalSession>();
  private listeners = new Set<() => void>();

  getAll(): SessionItem[] {
    return Array.from(this.sessions.values()).map(s => this.toPublic(s));
  }

  get(id: string): SessionItem | null {
    const s = this.sessions.get(id);
    return s ? this.toPublic(s) : null;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // Test-only entry point. Real flows use startLocal/startUrl in later tasks.
  createForTest(args: { title: string; stage: SessionStage; progress?: SessionProgress }): string {
    const id = makeId();
    this.sessions.set(id, {
      id, title: args.title, stage: args.stage,
      videoId: null, progress: args.progress ?? null,
      startedAt: new Date().toISOString(), error: null
    });
    this.emit();
    return id;
  }

  private toPublic(s: InternalSession): SessionItem {
    return {
      id: s.id, title: s.title, stage: s.stage, videoId: s.videoId,
      progress: s.progress, startedAt: s.startedAt, error: s.error
    };
  }

  private emit() {
    for (const cb of this.listeners) { try { cb(); } catch { /* ignore */ } }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- src/main/sessions/manager.test.ts
```

Expected: 3 passing.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/sessions/manager.ts src/main/sessions/manager.test.ts
git commit -m "feat(sessions): types + SessionManager skeleton with change events"
```

---

## Task 2: Single-worker transcription scheduler

**Files:**
- Create: `src/main/sessions/scheduler.ts`
- Create: `src/main/sessions/scheduler.test.ts`

- [ ] **Step 1: Write the failing test `src/main/sessions/scheduler.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { TranscriptionScheduler } from './scheduler';

describe('TranscriptionScheduler', () => {
  it('runs jobs one at a time in FIFO order', async () => {
    const sched = new TranscriptionScheduler();
    const order: string[] = [];
    const job = (name: string, ms: number) => () =>
      new Promise<void>(res => setTimeout(() => { order.push(name); res(); }, ms));
    await Promise.all([
      sched.submit('a', job('a', 30)),
      sched.submit('b', job('b', 10))
    ]);
    expect(order).toEqual(['a', 'b']);
  });

  it('reports current running id', async () => {
    const sched = new TranscriptionScheduler();
    let release: () => void = () => {};
    const blocking = new Promise<void>(res => { release = res; });
    const p = sched.submit('x', () => blocking);
    await new Promise(r => setImmediate(r));
    expect(sched.runningId()).toBe('x');
    release();
    await p;
    expect(sched.runningId()).toBeNull();
  });

  it('cancel(id) of a queued job drops it without running', async () => {
    const sched = new TranscriptionScheduler();
    let aRan = false, bRan = false;
    let releaseA: () => void = () => {};
    const aBlock = new Promise<void>(res => { releaseA = res; });
    const pA = sched.submit('a', async () => { aRan = true; await aBlock; });
    const pB = sched.submit('b', async () => { bRan = true; });
    await new Promise(r => setImmediate(r));
    sched.cancel('b');
    releaseA();
    await pA;
    await expect(pB).rejects.toThrow(/cancel/i);
    expect(aRan).toBe(true);
    expect(bRan).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
npm test -- src/main/sessions/scheduler.test.ts
```

- [ ] **Step 3: Implement `src/main/sessions/scheduler.ts`**

```ts
type Job = () => Promise<void>;

interface Pending {
  id: string;
  job: Job;
  resolve: () => void;
  reject: (e: unknown) => void;
  cancelled: boolean;
}

export class TranscriptionScheduler {
  private q: Pending[] = [];
  private running: Pending | null = null;

  submit(id: string, job: Job): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.q.push({ id, job, resolve, reject, cancelled: false });
      void this.tick();
    });
  }

  runningId(): string | null {
    return this.running?.id ?? null;
  }

  /**
   * Cancel a queued (not-yet-running) job. To cancel a running job,
   * the SessionManager must call the worker's own terminate path —
   * the scheduler just gates concurrency, it does not own workers.
   */
  cancel(id: string): boolean {
    const idx = this.q.findIndex(p => p.id === id && !p.cancelled);
    if (idx === -1) return false;
    const p = this.q[idx];
    p.cancelled = true;
    p.reject(new Error('Cancelled before run'));
    this.q.splice(idx, 1);
    return true;
  }

  private async tick() {
    if (this.running) return;
    while (this.q.length) {
      const next = this.q.shift()!;
      if (next.cancelled) continue;
      this.running = next;
      try { await next.job(); next.resolve(); }
      catch (e) { next.reject(e); }
      finally { this.running = null; }
    }
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm test -- src/main/sessions/scheduler.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/main/sessions/scheduler.ts src/main/sessions/scheduler.test.ts
git commit -m "feat(sessions): scheduler with single-worker gate and queued-job cancel"
```

---

## Task 3: Transcription worker thread

**Files:**
- Create: `src/main/transcription/transcribe-worker.ts`
- Create: `src/main/transcription/transcribe-host.ts`
- Create: `src/main/transcription/transcribe-host.test.ts`

The host runs in main. It spawns a `worker_thread` that loads `smart-whisper` and runs `transcribe()` (existing helper in `whisper.ts`). The host exposes `run(opts) → { result, cancel }` so SessionManager can both await results and abort.

- [ ] **Step 1: Write `src/main/transcription/transcribe-worker.ts`** (worker entrypoint)

```ts
import { parentPort, workerData } from 'node:worker_threads';
import { transcribe } from './whisper';

interface WorkerInput {
  modelPath: string;
  audioPath: string;
  language: string;
}

async function main() {
  const { modelPath, audioPath, language } = workerData as WorkerInput;
  try {
    const segments = await transcribe(modelPath, {
      audioPath,
      language: language === 'auto' ? undefined : language,
      onProgress: (segIdx, partial) => {
        parentPort?.postMessage({ type: 'progress', segIdx, partial });
      }
    });
    parentPort?.postMessage({ type: 'done', segments });
  } catch (e) {
    parentPort?.postMessage({ type: 'error', message: (e as Error).message });
  }
}

void main();
```

- [ ] **Step 2: Write the failing host test `src/main/transcription/transcribe-host.test.ts`**

This test uses a fake worker stub to keep tests fast and avoid loading real whisper:

```ts
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { runTranscription } from './transcribe-host';

vi.mock('node:worker_threads', () => {
  class FakeWorker extends EventEmitter {
    public terminated = false;
    constructor(_path: string, _opts: { workerData: unknown }) { super(); }
    terminate() { this.terminated = true; this.emit('exit', 1); return Promise.resolve(1); }
  }
  return { Worker: FakeWorker };
});

import { Worker } from 'node:worker_threads';

describe('runTranscription host', () => {
  it('resolves with segments on worker done message', async () => {
    const handle = runTranscription({ modelPath: '/m', audioPath: '/a', language: 'en' });
    // Grab the last constructed FakeWorker.
    // @ts-expect-error vitest mock
    const w = (Worker as any).mock?.instances?.at(-1);
    // FakeWorker is not an auto-mock, instead retrieve via a different mechanism:
    // emit synthesized result via global FakeWorker last-instance pattern is brittle —
    // so instead we just call into the public events using the returned Promise machinery.
    // Workaround: implementation must expose `worker` for white-box testing.
    handle.worker.emit('message', { type: 'progress', segIdx: 0, partial: 'hi' });
    handle.worker.emit('message', { type: 'done', segments: [{ start: 0, end: 1, text: 'hi' }] });
    const segs = await handle.result;
    expect(segs).toEqual([{ start: 0, end: 1, text: 'hi' }]);
  });

  it('rejects on error message', async () => {
    const handle = runTranscription({ modelPath: '/m', audioPath: '/a', language: 'auto' });
    handle.worker.emit('message', { type: 'error', message: 'boom' });
    await expect(handle.result).rejects.toThrow('boom');
  });

  it('cancel() calls worker.terminate and rejects the result', async () => {
    const handle = runTranscription({ modelPath: '/m', audioPath: '/a', language: 'auto' });
    handle.cancel();
    await expect(handle.result).rejects.toThrow(/cancel/i);
    expect((handle.worker as unknown as { terminated: boolean }).terminated).toBe(true);
  });

  it('emits onProgress callback', async () => {
    const onProgress = vi.fn();
    const handle = runTranscription({ modelPath: '/m', audioPath: '/a', language: 'auto', onProgress });
    handle.worker.emit('message', { type: 'progress', segIdx: 2, partial: 'hello world' });
    handle.worker.emit('message', { type: 'done', segments: [] });
    await handle.result;
    expect(onProgress).toHaveBeenCalledWith(2, 'hello world');
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
npm test -- src/main/transcription/transcribe-host.test.ts
```

- [ ] **Step 4: Implement `src/main/transcription/transcribe-host.ts`**

```ts
import { Worker } from 'node:worker_threads';
import { join } from 'path';
import type { TranscriptSegment } from '@shared/types';

export interface RunOpts {
  modelPath: string;
  audioPath: string;
  language: string;
  onProgress?: (segIdx: number, partial: string) => void;
}

export interface RunHandle {
  result: Promise<TranscriptSegment[]>;
  cancel: () => void;
  worker: Worker;
}

export function runTranscription(opts: RunOpts): RunHandle {
  // electron-vite compiles workers next to the host. Use new URL() so the bundler
  // emits the worker entry; at runtime it resolves to the same out/ directory.
  const workerPath = new URL('./transcribe-worker.js', import.meta.url).pathname;
  const worker = new Worker(workerPath, {
    workerData: {
      modelPath: opts.modelPath,
      audioPath: opts.audioPath,
      language: opts.language
    }
  });
  let cancelled = false;
  const result = new Promise<TranscriptSegment[]>((resolve, reject) => {
    worker.on('message', (msg: { type: string;[k: string]: unknown }) => {
      if (msg.type === 'progress') {
        opts.onProgress?.(msg.segIdx as number, msg.partial as string);
      } else if (msg.type === 'done') {
        resolve(msg.segments as TranscriptSegment[]);
      } else if (msg.type === 'error') {
        reject(new Error(msg.message as string));
      }
    });
    worker.on('error', reject);
    worker.on('exit', () => {
      if (cancelled) reject(new Error('Cancelled'));
    });
  });
  return {
    worker,
    result,
    cancel: () => { cancelled = true; void worker.terminate(); }
  };
}
```

> **Bundling note:** `electron-vite` should pick up the worker entry via the `new URL(...)` pattern. If `npm run build` fails to emit `transcribe-worker.js`, add an explicit entry in `electron.vite.config.ts` under `main.build.rollupOptions.input` mapping `transcribeWorker` → `src/main/transcription/transcribe-worker.ts`. Note this if it surfaces during the smoke test.

- [ ] **Step 5: Run tests**

```bash
npm test -- src/main/transcription/transcribe-host.test.ts
```

Expected: 4 passing.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/main/transcription/transcribe-worker.ts src/main/transcription/transcribe-host.ts src/main/transcription/transcribe-host.test.ts
git commit -m "feat(transcription): worker_thread host with cancel via terminate"
```

---

## Task 4: SessionManager.startLocal() — orchestrate local-file pipeline

This wires together: import via `crud.importVideo`, optional auto-transcribe via host + scheduler, optional auto-summarize via existing LLM IPC.

**Files:**
- Modify: `src/main/sessions/manager.ts`
- Modify: `src/main/sessions/manager.test.ts`

- [ ] **Step 1: Extend manager test** — append to `manager.test.ts`:

```ts
import { vi } from 'vitest';

vi.mock('@main/library/crud', () => ({
  importVideo: vi.fn(async (opts: { title: string }) => ({
    id: 'vid_1', title: opts.title, slug: 'x', folderName: 'f',
    originalFilename: 'o', sourceRelPath: 'f/source.mp4',
    thumbnailRelPath: 'f/t.jpg', durationSec: 1,
    createdAt: '2026-05-21', status: 'imported' as const
  }))
}));
vi.mock('@main/media/ffmpeg', () => ({
  extractDuration: vi.fn(async () => 1),
  extractThumbnail: vi.fn(async () => Buffer.from('x'))
}));

describe('SessionManager.startLocal', () => {
  it('creates a session in importing-local, runs import, transitions to imported', async () => {
    const m = new SessionManager({
      libraryPath: '/tmp/lib',
      importMode: 'copy',
      autoTranscribe: false,
      autoSummarize: false
    });
    const seen: string[] = [];
    m.onChange(() => { const all = m.getAll(); if (all[0]) seen.push(all[0].stage); });

    const id = await m.startLocal({ sourcePath: '/tmp/in.mp4', title: 'My Vid' });

    const final = m.get(id);
    expect(final?.stage).toBe('imported');
    expect(final?.videoId).toBe('vid_1');
    expect(seen).toContain('importing-local');
    expect(seen).toContain('imported');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL** (`startLocal not a function`)

```bash
npm test -- src/main/sessions/manager.test.ts
```

- [ ] **Step 3: Extend `src/main/sessions/manager.ts`**

Add at top:

```ts
import { importVideo } from '@main/library/crud';
import { extractDuration, extractThumbnail } from '@main/media/ffmpeg';
```

Add a constructor + config to the class:

```ts
export interface SessionManagerConfig {
  libraryPath: string;
  importMode: 'copy' | 'move';
  autoTranscribe: boolean;
  autoSummarize: boolean;
}

export class SessionManager {
  // ... existing fields
  private cfg: SessionManagerConfig | null = null;

  constructor(cfg?: SessionManagerConfig) {
    if (cfg) this.cfg = cfg;
  }

  setConfig(cfg: SessionManagerConfig) { this.cfg = cfg; }

  async startLocal(args: { sourcePath: string; title: string }): Promise<string> {
    if (!this.cfg) throw new Error('SessionManager: config not set');
    const id = makeId();
    const internal: InternalSession = {
      id, title: args.title, stage: 'importing-local',
      videoId: null, progress: { phase: 'import', message: 'Copying file…' },
      startedAt: new Date().toISOString(), error: null
    };
    this.sessions.set(id, internal);
    this.emit();
    try {
      const durationSec = await extractDuration(args.sourcePath);
      const thumb = await extractThumbnail(args.sourcePath, durationSec);
      const meta = await importVideo({
        libraryPath: this.cfg.libraryPath,
        sourceAbsPath: args.sourcePath,
        title: args.title,
        importMode: this.cfg.importMode,
        durationSec,
        thumbnailBytes: thumb
      });
      internal.videoId = meta.id;
      internal.stage = 'imported';
      internal.progress = null;
      this.emit();
    } catch (e) {
      internal.stage = 'error';
      internal.error = (e as Error).message;
      this.emit();
    }
    return id;
  }
}
```

Update `createForTest` so existing tests still compile — it doesn't need cfg. Existing skeleton tests stay green.

- [ ] **Step 4: Run tests**

```bash
npm test -- src/main/sessions/manager.test.ts
```

Expected: 4 passing (3 skeleton + 1 startLocal).

- [ ] **Step 5: Commit**

```bash
git add src/main/sessions/manager.ts src/main/sessions/manager.test.ts
git commit -m "feat(sessions): SessionManager.startLocal orchestrates local import"
```

---

## Task 5: SessionManager.startUrl() — URL import via yt-dlp

Use the existing `startYtdlpDownload` helper inside `src/main/ipc/ytdlp.ts`. SessionManager subscribes to that helper's progress and translates it into session progress events.

- [ ] **Step 1: Audit current yt-dlp module** — read `src/main/ipc/ytdlp.ts` and identify any exported core function that can be called from SessionManager without going through the renderer IPC. If only an IPC handler exists, refactor: extract the core implementation into a function `startDownload({ url, titleOverride, libraryPath, onProgress }) → Promise<{ requestId; finished: Promise<VideoMeta> }>`, leave the IPC handler in place but have it call the new helper. This refactor is internal — no behaviour change.

- [ ] **Step 2: Write the failing test** — append to `manager.test.ts`:

```ts
vi.mock('@main/ipc/ytdlp', () => {
  const listeners = new Set<(e: { phase: string; message: string }) => void>();
  return {
    startDownload: vi.fn(async (args: any) => ({
      requestId: 'req_1',
      finished: Promise.resolve({
        id: 'vid_url', title: args.titleOverride ?? 'YT video',
        slug: 'y', folderName: 'f2', originalFilename: 'o',
        sourceRelPath: 'f2/source.mp4', thumbnailRelPath: 'f2/t.jpg',
        durationSec: 10, createdAt: '2026-05-21', status: 'imported' as const
      }),
      onProgress: (cb: any) => { listeners.add(cb); return () => listeners.delete(cb); },
      cancel: vi.fn()
    }))
  };
});

describe('SessionManager.startUrl', () => {
  it('starts an importing-url session and transitions to imported on finish', async () => {
    const m = new SessionManager({
      libraryPath: '/tmp/lib', importMode: 'copy',
      autoTranscribe: false, autoSummarize: false
    });
    const id = await m.startUrl({ url: 'https://x', title: 'YT' });
    // Allow finished promise to settle.
    await new Promise(r => setImmediate(r));
    expect(m.get(id)?.stage).toBe('imported');
    expect(m.get(id)?.videoId).toBe('vid_url');
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

- [ ] **Step 4: Add `startUrl` to `src/main/sessions/manager.ts`**

```ts
import { startDownload } from '@main/ipc/ytdlp';

async startUrl(args: { url: string; title?: string }): Promise<string> {
  if (!this.cfg) throw new Error('SessionManager: config not set');
  const id = makeId();
  const internal: InternalSession = {
    id, title: args.title ?? args.url, stage: 'importing-url',
    videoId: null, progress: { phase: 'download', message: 'Starting…' },
    startedAt: new Date().toISOString(), error: null
  };
  this.sessions.set(id, internal);
  this.emit();

  const dl = await startDownload({
    url: args.url,
    titleOverride: args.title,
    libraryPath: this.cfg.libraryPath
  });
  internal.ytdlpRequestId = dl.requestId;

  dl.onProgress(p => {
    internal.progress = { phase: p.phase, message: p.message };
    this.emit();
  });

  dl.finished.then(meta => {
    internal.title = meta.title;
    internal.videoId = meta.id;
    internal.stage = 'imported';
    internal.progress = null;
    this.emit();
  }).catch(e => {
    if (internal.stage === 'cancelled') return; // cancel set state already
    internal.stage = 'error';
    internal.error = (e as Error).message;
    this.emit();
  });

  return id;
}
```

- [ ] **Step 5: Run test, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/ytdlp.ts src/main/sessions/manager.ts src/main/sessions/manager.test.ts
git commit -m "feat(sessions): SessionManager.startUrl + extract reusable yt-dlp helper"
```

---

## Task 6: Auto-transcribe + auto-summarize + cancel/dismiss

Bring transcription into the pipeline via the host (Task 3) and scheduler (Task 2). Add cancel and dismiss semantics. Auto-summarize routes through the existing `llm.summarize` IPC.

- [ ] **Step 1: Extend test** — append:

```ts
vi.mock('@main/transcription/transcribe-host', () => ({
  runTranscription: vi.fn(() => {
    const w = { terminate: vi.fn() };
    return { worker: w, result: Promise.resolve([{ start: 0, end: 1, text: 'hi' }]), cancel: () => w.terminate() };
  })
}));
vi.mock('@main/transcription/whisper', () => ({
  ensureModel: vi.fn(async () => '/m')
}));
vi.mock('@main/ipc/transcription', () => ({
  extractWav: vi.fn(async () => '/tmp/a.wav')
}));

describe('SessionManager auto-transcribe', () => {
  it('runs scheduler -> transcribed when autoTranscribe is on', async () => {
    const m = new SessionManager({
      libraryPath: '/tmp/lib', importMode: 'copy',
      autoTranscribe: true, autoSummarize: false
    });
    const id = await m.startLocal({ sourcePath: '/tmp/x.mp4', title: 'T' });
    // Wait for transcription path.
    await new Promise(r => setTimeout(r, 20));
    expect(m.get(id)?.stage).toBe('transcribed');
  });
});

describe('SessionManager.cancel', () => {
  it('marks session cancelled and removes it via dismiss after terminal', async () => {
    const m = new SessionManager({
      libraryPath: '/tmp/lib', importMode: 'copy',
      autoTranscribe: false, autoSummarize: false
    });
    const id = m.createForTest({ title: 'A', stage: 'importing-local' });
    await m.cancel(id);
    expect(m.get(id)?.stage).toBe('cancelled');
    m.dismiss(id);
    expect(m.get(id)).toBeNull();
  });

  it('dismiss throws for non-terminal stage', () => {
    const m = new SessionManager();
    const id = m.createForTest({ title: 'A', stage: 'transcribing' });
    expect(() => m.dismiss(id)).toThrow(/cancel first/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Wire transcription into `startLocal` / `startUrl`**

In `manager.ts` add a private helper:

```ts
private async maybeAutoTranscribe(internal: InternalSession) {
  if (!this.cfg?.autoTranscribe || !internal.videoId) return;
  const videoId = internal.videoId;
  internal.stage = 'transcribing';
  internal.progress = { phase: 'transcribe', message: 'Queued…' };
  this.emit();
  await this.scheduler.submit(internal.id, async () => {
    if (internal.stage === 'cancelled') return;
    internal.progress = { phase: 'transcribe', message: 'Extracting audio…' };
    this.emit();
    const wav = await extractWav(this.absVideoPath(videoId));
    const modelPath = await ensureModel(this.cfg!.modelsDir, this.cfg!.defaultModel);
    const handle = runTranscription({
      modelPath, audioPath: wav, language: this.cfg!.defaultLanguage ?? 'auto',
      onProgress: (_i, partial) => {
        internal.progress = { phase: 'transcribe', message: partial };
        this.emit();
      }
    });
    internal.cancelTranscription = () => handle.cancel();
    const segments = await handle.result;
    await writeTranscript(this.cfg!.libraryPath, videoId, segments); // existing helper
    internal.stage = 'transcribed';
    internal.progress = null;
    this.emit();
  }).catch(e => {
    if (internal.stage === 'cancelled') return;
    internal.stage = 'error';
    internal.error = (e as Error).message;
    this.emit();
  });
}
```

Call `await this.maybeAutoTranscribe(internal)` at the end of `startLocal` (after stage=imported) and inside the `.then` of `startUrl` (after stage=imported). For `startUrl`, do not `await` it (the caller wants the session id back immediately).

Extend the `SessionManagerConfig` with:

```ts
modelsDir: string;
defaultModel: ModelName;
defaultLanguage?: string;
```

Pass these from the IPC layer (Task 7) using `app.getPath('userData')` / settings.

- [ ] **Step 4: Add `cancel(id)` and `dismiss(id)`**

```ts
async cancel(id: string): Promise<void> {
  const s = this.sessions.get(id);
  if (!s) return;
  switch (s.stage) {
    case 'importing-url':
      if (s.ytdlpRequestId) {
        const { cancelDownload } = await import('@main/ipc/ytdlp');
        await cancelDownload(s.ytdlpRequestId);
      }
      break;
    case 'transcribing':
      s.cancelTranscription?.();
      this.scheduler.cancel(id); // no-op if already running
      break;
    case 'imported':
      this.scheduler.cancel(id); // remove from queue if queued
      break;
    case 'importing-local':
      // best-effort: local copy is usually too fast to cancel cleanly
      break;
  }
  s.stage = 'cancelled';
  s.progress = null;
  this.emit();
}

dismiss(id: string): void {
  const s = this.sessions.get(id);
  if (!s) return;
  const terminal: SessionStage[] = ['summarized', 'transcribed', 'cancelled', 'error'];
  if (!terminal.includes(s.stage)) {
    throw new Error(`Cannot dismiss session in stage "${s.stage}" — cancel first`);
  }
  this.sessions.delete(id);
  this.emit();
}
```

Note: `transcribed` is included in `terminal` so the user can dismiss a finished pipeline without forcing them to summarize. Auto-summarize, if enabled, will have already advanced the session past `transcribed`.

- [ ] **Step 5: Add auto-summarize hook**

In the auto-transcribe success path, append:

```ts
if (this.cfg?.autoSummarize && this.cfg.defaultLlm?.providerId && this.cfg.defaultLlm.model) {
  internal.stage = 'summarizing';
  internal.progress = { phase: 'summary', message: 'Generating…' };
  this.emit();
  try {
    const transcript = segments.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    const markdown = await summarizeOnce({
      providerId: this.cfg.defaultLlm.providerId,
      model: this.cfg.defaultLlm.model,
      transcript,
      systemPrompt: this.cfg.summaryPrompt
    });
    await writeSummary(this.cfg.libraryPath, videoId, markdown); // existing helper
    internal.stage = 'summarized';
    internal.progress = null;
    this.emit();
  } catch (e) {
    internal.stage = 'error'; internal.error = (e as Error).message; this.emit();
  }
}
```

`summarizeOnce` is a tiny non-streaming wrapper around the existing LLM module (see `src/main/llm/`). If only a streaming API exists, accumulate tokens into a string before resolving. Add this helper alongside the manager (`src/main/sessions/summarize-once.ts`) and reuse the existing provider clients — do NOT duplicate provider logic.

- [ ] **Step 6: Run tests**

```bash
npm test -- src/main/sessions/
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/main/sessions/ src/main/transcription/
git commit -m "feat(sessions): auto-transcribe + auto-summarize + cancel/dismiss"
```

---

## Task 7: Sessions IPC + preload

**Files:**
- Create: `src/main/ipc/sessions.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Create `src/main/ipc/sessions.ts`**

```ts
import { BrowserWindow, ipcMain } from 'electron';
import { SessionManager } from '@main/sessions/manager';
import { getSettings } from '@main/settings';
import { app } from 'electron';
import { join } from 'path';

let manager: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!manager) throw new Error('Session manager not initialised');
  return manager;
}

export function registerSessionsIpc() {
  const s = getSettings();
  manager = new SessionManager({
    libraryPath: s.libraryPath,
    importMode: s.importMode,
    autoTranscribe: s.autoTranscribe,
    autoSummarize: s.autoSummarize,
    modelsDir: join(app.getPath('userData'), 'whisper-models'),
    defaultModel: s.whisper.defaultModel,
    defaultLanguage: 'auto',
    defaultLlm: s.defaultLlm,
    summaryPrompt: s.prompts.summary
  });

  manager.onChange(() => {
    const items = manager!.getAll();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('sessions:changed', { items });
    }
  });

  ipcMain.handle('sessions:list', () => manager!.getAll());
  ipcMain.handle('sessions:get', (_e, id: string) => manager!.get(id));
  ipcMain.handle('sessions:startLocal', (_e, args: { sourcePath: string; title: string }) =>
    manager!.startLocal(args).then(id => ({ id }))
  );
  ipcMain.handle('sessions:startUrl', (_e, args: { url: string; title?: string }) =>
    manager!.startUrl(args).then(id => ({ id }))
  );
  ipcMain.handle('sessions:cancel', (_e, id: string) => manager!.cancel(id));
  ipcMain.handle('sessions:dismiss', (_e, id: string) => manager!.dismiss(id));
}
```

> **Settings sync:** When the user changes settings, call `manager.setConfig(...)` so library path / autoflags / default model update without an app restart. Add a hook in `src/main/ipc/settings.ts` after the `save` handler that re-pushes the new config into the manager (only the fields the manager actually reads).

- [ ] **Step 2: Register in `src/main/ipc/index.ts`**

Add `import { registerSessionsIpc } from './sessions';` and call `registerSessionsIpc()` near the other registrations.

- [ ] **Step 3: Extend `src/preload/index.ts`**

Inside the `api` object, add:

```ts
sessions: {
  list: (): Promise<SessionItem[]> => ipcRenderer.invoke('sessions:list'),
  get: (id: string): Promise<SessionItem | null> => ipcRenderer.invoke('sessions:get', id),
  startLocal: (sourcePath: string, title: string): Promise<{ id: string }> =>
    ipcRenderer.invoke('sessions:startLocal', { sourcePath, title }),
  startUrl: (url: string, title?: string): Promise<{ id: string }> =>
    ipcRenderer.invoke('sessions:startUrl', { url, title }),
  cancel: (id: string): Promise<void> => ipcRenderer.invoke('sessions:cancel', id),
  dismiss: (id: string): Promise<void> => ipcRenderer.invoke('sessions:dismiss', id),
  onChange: (fn: (items: SessionItem[]) => void) => {
    const listener = (_: unknown, p: { items: SessionItem[] }) => fn(p.items);
    ipcRenderer.on('sessions:changed', listener);
    return () => ipcRenderer.removeListener('sessions:changed', listener);
  }
},
```

Import `SessionItem` from `../shared/types`.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/ src/preload/index.ts
git commit -m "feat(sessions): IPC handlers and preload bridge for sessions"
```

---

## Task 8: Retire TranscriptionQueue + old transcription IPC

Now that SessionManager owns transcription, remove the parallel path so we don't have two queues racing.

- [ ] **Step 1: Delete `src/main/transcription/queue.ts` and `queue.test.ts`**

```bash
git rm src/main/transcription/queue.ts src/main/transcription/queue.test.ts
```

- [ ] **Step 2: Remove queue usage from `src/main/ipc/transcription.ts`**

The file currently `import { TranscriptionQueue } from '@main/transcription/queue'`. Remove that import and any queue-related handlers (`transcription:getQueue`, `transcription:queueChanged`, `transcription:start`). Keep `extractWav` (export it so SessionManager can import it — see Task 6).

If `transcription:start` was called from anywhere besides `NewVideo` (re-transcribe from VideoDetail?), have that caller route through `sessions:startTranscribe(videoId)` instead — add a small extra method to SessionManager:

```ts
async startTranscribe(videoId: string): Promise<string> {
  // creates a session at stage='imported' bound to an existing videoId,
  // then dispatches to maybeAutoTranscribe with autoTranscribe forced on
}
```

Audit: `grep -rn "transcription.start\|transcription:start" src/` and update each call site.

- [ ] **Step 3: Remove `transcription.start` / `transcription.getQueue` / `transcription.onQueueChanged` from preload**

In `src/preload/index.ts`, drop those entries. Keep `transcription.onProgress`, `onDone`, `onError` if any UI still listens (Sidebar will be migrated in Task 9, but VideoDetail may also listen — check by grep).

- [ ] **Step 4: Run full test suite + typecheck**

```bash
npm test
npm run typecheck
```

Expected: all green; the dropped queue tests are gone, replaced by scheduler tests from Task 2.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(transcription): retire TranscriptionQueue in favour of SessionManager"
```

---

## Task 9: Sidebar — clickable rows + × button

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`

- [ ] **Step 1: Replace the Processing section**

Remove the `QueueItem` type + `window.api.transcription.getQueue/onQueueChanged` calls. Replace with sessions:

```tsx
import type { SessionItem } from '@shared/types';
import { X } from 'lucide-react';

// inside component:
const [sessions, setSessions] = useState<SessionItem[]>([]);
useEffect(() => {
  void window.api.sessions.list().then(setSessions).catch(() => {});
  const off = window.api.sessions.onChange(items => setSessions(items));
  return () => { off(); };
}, []);

const isTerminal = (s: SessionItem) =>
  ['summarized', 'transcribed', 'cancelled', 'error'].includes(s.stage);

const onActionClick = async (e: React.MouseEvent, s: SessionItem) => {
  e.preventDefault();
  e.stopPropagation();
  if (isTerminal(s)) {
    await window.api.sessions.dismiss(s.id);
  } else {
    if (!confirm(`Cancel "${s.title}"?`)) return;
    await window.api.sessions.cancel(s.id);
  }
};

// Replace the existing `queue.length > 0` block with:
{sessions.length > 0 && (
  <div className="border-t border-slate-200 pt-2 mb-1 -mx-3 px-3 bg-slate-50">
    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
      <Loader2 size={12} className="animate-spin" /> Sessions
    </div>
    <ul className="space-y-1">
      {sessions.map(s => (
        <li key={s.id}>
          <NavLink to={`/sessions/${s.id}`}
                   className={({isActive}) =>
                     cn('flex items-center gap-1.5 text-[11px] px-1 py-0.5 rounded',
                        isActive ? 'bg-slate-200' : 'hover:bg-slate-100')}>
            <span className="truncate flex-1 text-slate-700" title={s.title}>{s.title}</span>
            <span className={cn(
              'shrink-0 px-1.5 py-0.5 rounded text-[10px]',
              s.stage === 'error' ? 'bg-red-100 text-red-800' :
              s.stage === 'cancelled' ? 'bg-slate-200 text-slate-700' :
              s.stage.startsWith('importing') ? 'bg-amber-100 text-amber-800' :
              s.stage === 'transcribing' ? 'bg-blue-100 text-blue-800' :
              s.stage === 'summarizing' ? 'bg-purple-100 text-purple-800' :
              'bg-green-100 text-green-800'
            )}>{s.stage}</span>
            <button onClick={e => onActionClick(e, s)}
                    className="shrink-0 text-slate-400 hover:text-slate-700"
                    title={isTerminal(s) ? 'Remove' : 'Cancel'}>
              <X size={11} />
            </button>
          </NavLink>
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 2: Manual smoke** — `npm run dev`, import a local file via NewVideo (still works pre-refactor since Task 11 is later), confirm sidebar lists the session, the × button cancels.

> Sidebar will not show real Sessions until Task 11 routes NewVideo through `sessions:startLocal`. If you implement tasks in order, the sidebar shows an empty Sessions list at this point — that's expected.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/Sidebar.tsx
git commit -m "feat(sidebar): clickable session rows with cancel/dismiss button"
```

---

## Task 10: SessionDetail route + App routing

**Files:**
- Create: `src/renderer/routes/SessionDetail.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Skeleton component** — `SessionDetail.tsx`

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/cn';
import type { SessionItem } from '@shared/types';

function StageBullet({ index, state }: { index: number; state: 'idle' | 'active' | 'done' | 'error' }) {
  return (
    <div className={cn(
      'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 z-10 bg-white',
      state === 'done' && 'bg-green-500 border-green-500 text-white',
      state === 'active' && 'bg-slate-900 border-slate-900 text-white',
      state === 'error' && 'bg-red-500 border-red-500 text-white',
      state === 'idle' && 'border-slate-300 text-slate-500'
    )}>
      {state === 'done' ? <Check size={16} /> : state === 'active' ? <Loader2 size={16} className="animate-spin" /> : index}
    </div>
  );
}

export default function SessionDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [s, setS] = useState<SessionItem | null>(null);

  useEffect(() => {
    void window.api.sessions.get(id).then(setS);
    const off = window.api.sessions.onChange(items => {
      const found = items.find(x => x.id === id);
      setS(found ?? null);
    });
    return () => { off(); };
  }, [id]);

  if (!s) return <div className="p-8">Session not found.</div>;

  const importDone = s.stage !== 'importing-local' && s.stage !== 'importing-url';
  const transcribeDone = ['transcribed','summarizing','summarized'].includes(s.stage);
  const summarizeDone = s.stage === 'summarized';

  const stage1: 'idle' | 'active' | 'done' | 'error' =
    s.stage === 'error' && !importDone ? 'error' :
    importDone ? 'done' : 'active';
  const stage2: 'idle' | 'active' | 'done' | 'error' =
    !importDone ? 'idle' :
    transcribeDone ? 'done' :
    s.stage === 'transcribing' ? 'active' :
    s.stage === 'error' ? 'error' : 'idle';
  const stage3: 'idle' | 'active' | 'done' | 'error' =
    !transcribeDone ? 'idle' :
    summarizeDone ? 'done' :
    s.stage === 'summarizing' ? 'active' : 'idle';

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">{s.title}</h1>
      <p className="text-sm text-slate-500 mb-6">Session {s.id} · started {new Date(s.startedAt).toLocaleTimeString()}</p>

      <div className="relative">
        <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-200" />

        <section className="relative mb-8 grid grid-cols-[2rem_1fr] gap-x-4 items-start">
          <StageBullet index={1} state={stage1} />
          <div>
            <h2 className="text-lg font-semibold leading-8 mb-1">Import</h2>
            {s.stage.startsWith('importing') && (
              <div className="text-sm text-slate-600 bg-slate-50 border rounded p-3">
                <Loader2 size={14} className="inline animate-spin mr-1.5" />
                {s.progress?.message ?? '…'}
              </div>
            )}
            {importDone && s.videoId && <div className="text-sm text-slate-600">Imported.</div>}
          </div>
        </section>

        <section className={cn('relative mb-8 grid grid-cols-[2rem_1fr] gap-x-4 items-start',
                               !importDone && 'opacity-40 pointer-events-none')}>
          <StageBullet index={2} state={stage2} />
          <div>
            <h2 className="text-lg font-semibold leading-8 mb-1">Transcribe</h2>
            {s.stage === 'transcribing' && (
              <div className="text-sm text-slate-600 bg-slate-50 border rounded p-3 max-h-40 overflow-auto">
                {s.progress?.message || 'Working…'}
              </div>
            )}
            {transcribeDone && <div className="text-sm text-green-700">Transcription complete.</div>}
          </div>
        </section>

        <section className={cn('relative grid grid-cols-[2rem_1fr] gap-x-4 items-start',
                               !transcribeDone && 'opacity-40 pointer-events-none')}>
          <StageBullet index={3} state={stage3} />
          <div>
            <h2 className="text-lg font-semibold leading-8 mb-1">Summarize <span className="text-sm font-normal text-slate-500">(optional)</span></h2>
            {s.stage === 'summarizing' && (
              <div className="text-sm text-slate-600 bg-slate-50 border rounded p-3">
                <Loader2 size={14} className="inline animate-spin mr-1.5" /> Generating summary…
              </div>
            )}
            {summarizeDone && <div className="text-sm text-green-700">Summary saved.</div>}
          </div>
        </section>

        {s.error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mt-4">
            {s.error}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          {s.videoId && <Button variant="outline" onClick={() => nav(`/video/${s.videoId}`)}>Open video</Button>}
          {!['summarized','transcribed','cancelled','error'].includes(s.stage)
            ? <Button variant="outline" onClick={() => window.api.sessions.cancel(s.id)}>Cancel session</Button>
            : <Button variant="outline" onClick={() => window.api.sessions.dismiss(s.id).then(() => nav('/'))}>Dismiss</Button>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route in `src/renderer/App.tsx`**

```tsx
import SessionDetail from '@renderer/routes/SessionDetail';
// inside <Routes>:
<Route path="/sessions/:id" element={<SessionDetail />} />
```

- [ ] **Step 3: Typecheck + commit**

```bash
npm run typecheck
git add src/renderer/routes/SessionDetail.tsx src/renderer/App.tsx
git commit -m "feat(sessions): /sessions/:id detail route mirroring NewVideo stages"
```

---

## Task 11: Slim NewVideo to a starter form

`NewVideo` becomes a fork: pick local file or URL → enter title → dispatch `sessions:startLocal` or `sessions:startUrl` → navigate to `/sessions/:id`. All the in-page progress + stage UI is gone (moved to SessionDetail).

**Files:**
- Modify: `src/renderer/routes/NewVideo.tsx` (heavy reduction — replace contents)

- [ ] **Step 1: Replace `NewVideo.tsx` with the starter form**

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/cn';
import { toast } from '@renderer/components/Toast';

type ImportSource = 'local' | 'url';

export default function NewVideo() {
  const nav = useNavigate();
  const [source, setSource] = useState<ImportSource>('local');
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const pickFile = async () => {
    const f = await window.api.library.pickFile();
    if (f) {
      setSourcePath(f);
      setTitle(f.split('/').pop()!.replace(/\.[^.]+$/, ''));
    }
  };

  const startLocal = async () => {
    if (!sourcePath || !title) return;
    setBusy(true);
    try {
      const { id } = await window.api.sessions.startLocal(sourcePath, title);
      nav(`/sessions/${id}`);
    } catch (e) {
      setBusy(false);
      toast.error(`Could not start: ${(e as Error).message}`);
    }
  };

  const startUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const { id } = await window.api.sessions.startUrl(url.trim(), title || undefined);
      nav(`/sessions/${id}`);
    } catch (e) {
      setBusy(false);
      toast.error(`Could not start: ${(e as Error).message}`);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New Video</h1>

      <div className="inline-flex rounded-md border bg-white p-0.5 mb-4 text-sm">
        <button onClick={() => setSource('local')} disabled={busy}
                className={cn('px-3 py-1 rounded', source === 'local' ? 'bg-slate-900 text-white' : 'text-slate-700')}>
          Local file
        </button>
        <button onClick={() => setSource('url')} disabled={busy}
                className={cn('px-3 py-1 rounded', source === 'url' ? 'bg-slate-900 text-white' : 'text-slate-700')}>
          From URL
        </button>
      </div>

      {source === 'local' && (
        <div className="space-y-3">
          <Button variant="outline" onClick={pickFile} disabled={busy}>
            {sourcePath ? 'Change file…' : 'Choose video file…'}
          </Button>
          {sourcePath && (
            <>
              <div className="text-sm text-slate-600 break-all">{sourcePath}</div>
              <label className="block text-sm">Title<br />
                <input value={title} onChange={e => setTitle(e.target.value)}
                       className="border rounded px-2 py-1 w-full max-w-md" />
              </label>
              <Button onClick={startLocal} disabled={busy || !title}>
                {busy ? 'Starting…' : 'Start session'}
              </Button>
            </>
          )}
        </div>
      )}

      {source === 'url' && (
        <div className="space-y-3">
          <label className="block text-sm">YouTube / video URL<br />
            <input value={url} onChange={e => setUrl(e.target.value)} disabled={busy}
                   placeholder="https://www.youtube.com/watch?v=…"
                   className="border rounded px-2 py-1 w-full max-w-md" />
          </label>
          <label className="block text-sm">Title (optional override)<br />
            <input value={title} onChange={e => setTitle(e.target.value)} disabled={busy}
                   className="border rounded px-2 py-1 w-full max-w-md" />
          </label>
          <Button onClick={startUrl} disabled={busy || !url.trim()}>
            {busy ? 'Starting…' : 'Start session'}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Search for orphaned hooks/imports**

```bash
grep -rn "useTranscriptionEvents\|useLlmStream" src/renderer | grep -v node_modules
```

These hooks are no longer used by NewVideo. If they aren't used elsewhere, delete them (their files in `src/renderer/hooks/`).

- [ ] **Step 3: Typecheck + manual smoke**

```bash
npm run typecheck
npm run dev
```

In the dev app:
- Choose a local `.mp4`, enter title, click Start session. App should navigate to `/sessions/:id`, sidebar shows the new session, progress runs through stages.
- Click Library while transcribing — sidebar still shows the session. Click it → return to the SessionDetail with live progress.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/routes/NewVideo.tsx src/renderer/hooks/ 2>/dev/null
git commit -m "feat(newvideo): shrink to starter form that dispatches sessions"
```

---

## Task 12: Settings — import-mode radio buttons

**Files:**
- Modify: `src/renderer/routes/Settings.tsx`

- [ ] **Step 1: Replace the checkbox**

Find the existing block in `Settings.tsx` (lines 86–90 at the time of writing):

```tsx
<label className="flex items-center gap-2 mt-3 text-sm">
  <input type="checkbox" checked={settings.importMode === 'move'}
         onChange={e => save({ importMode: e.target.checked ? 'move' : 'copy' })}/>
  Move file on import (default: copy)
</label>
```

Replace with:

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

- [ ] **Step 2: Manual smoke** — `npm run dev`, open Settings, confirm radios reflect current setting, click each, restart app, value persists.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/Settings.tsx
git commit -m "feat(settings): import-mode radio buttons replace checkbox"
```

---

## Task 13: Smoke verification + cleanup

- [ ] **Step 1: Run the full verification checklist from the spec**

For each item below, perform the action in the running dev app and tick the box only after observing the expected result.

- [ ] Start a URL import; while it downloads, open Library, then click the session in the sidebar — `/sessions/:id` shows live download progress.
- [ ] Start two URL imports back-to-back; both appear in the sidebar; the first transcribes when its download completes, the second waits in `imported` until the first transcription finishes.
- [ ] Cancel a download mid-flight (`×`) — session disappears (or moves to `cancelled`, then dismiss removes it), partial file gone from the library folder, video does not appear in Library.
- [ ] Cancel a running transcription (`×`) — worker dies (check Activity Monitor: no orphan high-CPU node process), video reverts to `imported` status, `.wav` temp cleaned, session terminal.
- [ ] Cancel a `summarizing` session — summary stream aborts, transcript stays, session reverts to `transcribed`.
- [ ] Dismiss a `summarized` session — row disappears; video stays in Library.
- [ ] Restart app while a session is `transcribing` — on next launch, sessions list is empty, video in Library has status `imported`, no orphan `.wav` files in temp.
- [ ] Settings → toggle import-mode radio; confirm both values persist across restart.

- [ ] **Step 2: Run full test suite**

```bash
npm test
npm run typecheck
```

Expected: green.

- [ ] **Step 3: If any verification item failed, file the gap** as a follow-up task and fix before merging.

- [ ] **Step 4: Final commit (optional)** — if smoke surfaced small fixes:

```bash
git add -A
git commit -m "fix(sessions): smoke-test follow-ups"
```

---

## Notes / risks tracked from spec

- **ffmpeg cancel during `.mov` remux**: not addressed in this plan (best-effort). Add a follow-up if it becomes a real problem.
- **Worker thread + native addon**: if `smart-whisper` does not load inside a worker, fall back to spawning a child Node process running a tiny CLI wrapper. Cost: extra startup time per transcription; gain: easy `kill -TERM`.
- **Settings auto-flow ergonomics**: the auto-transcribe / auto-summarize toggles affect the next session, not currently active ones. Mention this in the Settings tooltip text (optional polish, not in scope here).
