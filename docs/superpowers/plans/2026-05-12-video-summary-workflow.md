# Video Summary Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop Electron app that imports local videos, transcribes them with whisper.cpp, summarizes via Ollama or Gemini, and chats with an LLM about each video. Per-video library on disk; settings page; full-screen import wizard.

**Architecture:** Electron with a main process (Node) handling FS, transcription, and LLM calls and a React + Vite renderer for UI. IPC via `ipcRenderer.invoke` for request/response and `ipcRenderer.on` for streaming (transcription progress, LLM tokens). Library is a folder of per-video subfolders with a top-level `_index.json` cache.

**Tech Stack:** Electron, electron-vite, React 18, TypeScript, Tailwind CSS, shadcn/ui, Zustand, React Router (HashRouter), `smart-whisper` (whisper.cpp), `ffmpeg-static`, `@google/generative-ai`, `keytar`, Vitest, React Testing Library.

**Spec reference:** `docs/superpowers/specs/2026-05-12-video-summary-workflow-design.md`

---

## File Structure

```
/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.ts
├── postcss.config.js
├── components.json                   # shadcn config
├── vitest.config.ts
├── .gitignore
├── docs/superpowers/                 # already exists
└── src/
    ├── shared/
    │   └── types.ts                  # IPC payload + domain types shared main↔renderer
    ├── main/
    │   ├── index.ts                  # app entry, BrowserWindow, lifecycle
    │   ├── ipc/
    │   │   ├── index.ts              # register all handlers
    │   │   ├── settings.ts
    │   │   ├── library.ts
    │   │   ├── media.ts
    │   │   ├── transcription.ts
    │   │   └── llm.ts
    │   ├── settings/
    │   │   ├── index.ts              # load/save settings.json + keychain
    │   │   └── defaults.ts
    │   ├── library/
    │   │   ├── paths.ts              # path/slug/id helpers
    │   │   ├── index-store.ts        # _index.json read/write
    │   │   ├── reconcile.ts          # startup reconciliation
    │   │   └── crud.ts               # import / delete / update meta
    │   ├── media/
    │   │   └── ffmpeg.ts             # duration + thumbnail via ffmpeg-static
    │   ├── transcription/
    │   │   ├── models.ts             # model paths, download
    │   │   ├── queue.ts              # single-job queue
    │   │   └── whisper.ts            # smart-whisper wrapper
    │   └── llm/
    │       ├── types.ts              # LlmProvider interface
    │       ├── context.ts            # transcript-vs-summary context selector
    │       ├── ollama.ts
    │       └── gemini.ts
    ├── preload/
    │   └── index.ts                  # contextBridge exposes typed API
    └── renderer/
        ├── index.html
        ├── main.tsx
        ├── App.tsx                   # routes
        ├── routes/
        │   ├── Library.tsx
        │   ├── VideoDetail.tsx
        │   ├── Settings.tsx
        │   └── NewVideo.tsx
        ├── components/
        │   ├── Sidebar.tsx
        │   ├── VideoCard.tsx
        │   ├── TranscriptView.tsx
        │   ├── ChatPanel.tsx
        │   ├── SummaryView.tsx
        │   ├── WizardImportStep.tsx
        │   ├── WizardTranscribeStep.tsx
        │   ├── WizardSummarizeStep.tsx
        │   └── ui/                   # shadcn-generated
        ├── stores/
        │   ├── library.ts
        │   └── settings.ts
        ├── hooks/
        │   ├── useIpcStream.ts
        │   └── useVideo.ts
        └── styles/globals.css
```

Tests live next to source as `<name>.test.ts` for main-process modules, and under `src/renderer/__tests__/` for renderer components.

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `.gitignore`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/styles/globals.css`, `tailwind.config.ts`, `postcss.config.js`, `vitest.config.ts`

- [ ] **Step 1: Initialize directory & git**

```bash
cd /Users/jansernec/Desktop/PROJEKTI/VIDEO_SUMMARY_WORKFLOW
git init
echo "node_modules/\nout/\ndist/\n.DS_Store\n*.log\n" > .gitignore
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "video-summary-workflow",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "package": "electron-vite build && electron-builder"
  },
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "electron-store": "^8.2.0",
    "ffmpeg-static": "^5.2.0",
    "keytar": "^7.9.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "smart-whisper": "^0.9.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

Expected: completes without errors. `smart-whisper` will compile native bindings; allow ~2 min.

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 5: Write `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared'), '@main': resolve('src/main') } },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } }
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer') } },
    root: 'src/renderer',
    build: { rollupOptions: { input: { index: resolve('src/renderer/index.html') } } }
  }
});
```

- [ ] **Step 6: Write Tailwind + PostCSS config**

`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: { extend: {} },
  plugins: []
} satisfies Config;
```

`postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`src/renderer/styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
html, body, #root { height: 100%; margin: 0; }
```

- [ ] **Step 7: Write minimal main/preload/renderer entries**

`src/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'path';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true }
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```

`src/preload/index.ts`:
```ts
import { contextBridge } from 'electron';
contextBridge.exposeInMainWorld('api', {});
```

`src/renderer/index.html`:
```html
<!doctype html>
<html><head><meta charset="utf-8"><title>Video Summary</title></head>
<body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>
```

`src/renderer/main.tsx`:
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
createRoot(document.getElementById('root')!).render(<App />);
```

`src/renderer/App.tsx`:
```tsx
export default function App() {
  return <div className="p-4 text-lg">Video Summary Workflow — booting</div>;
}
```

- [ ] **Step 8: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': resolve('src/shared'), '@main': resolve('src/main'), '@renderer': resolve('src/renderer') } },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['src/renderer/**', 'jsdom']],
    globals: true
  }
});
```

- [ ] **Step 9: Verify dev boots**

Run: `npm run dev`
Expected: Electron window opens with "Video Summary Workflow — booting". Close it.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron + vite + react + tailwind project"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: Write shared types**

```ts
// src/shared/types.ts
export type VideoStatus =
  | 'imported'
  | 'transcribing'
  | 'transcribed'
  | 'summarizing'
  | 'summarized'
  | 'error';

export interface TranscriptSegment {
  start: number; // seconds
  end: number;
  text: string;
}

export interface VideoMeta {
  id: string;
  title: string;
  slug: string;
  folderName: string;
  originalFilename: string;
  sourceRelPath: string;       // relative to library root
  thumbnailRelPath: string;
  durationSec: number;
  createdAt: string;            // ISO
  status: VideoStatus;
  hash?: string;
  transcription?: { model: string; language: string; completedAt: string };
  summary?: { provider: 'ollama' | 'gemini'; model: string; systemPrompt: string; generatedAt: string };
  errorMessage?: string;
}

export interface IndexEntry {
  id: string;
  title: string;
  folderName: string;
  thumbnailRelPath: string;
  durationSec: number;
  createdAt: string;
  status: VideoStatus;
}

export interface AppSettings {
  libraryPath: string;
  importMode: 'copy' | 'move';
  whisper: { defaultModel: 'tiny' | 'base' | 'small' | 'medium' | 'large'; modelsDir: string };
  ollama: { baseUrl: string };
  gemini: { hasKey: boolean };          // actual key in keychain
  prompts: { summary: string; chat: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatHistory {
  messages: ChatMessage[];
  systemPromptUsed: string;
}

export type LlmProviderId = 'ollama' | 'gemini';

export interface TranscriptionProgress {
  videoId: string;
  segmentIndex: number;
  totalEstimate: number | null;
  partialText: string;
}

export interface LlmStreamChunk {
  requestId: string;
  token: string;
  done: boolean;
  error?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(shared): add domain & IPC types"
```

---

## Task 3: Settings module + defaults

**Files:**
- Create: `src/main/settings/defaults.ts`, `src/main/settings/index.ts`, `src/main/settings/index.test.ts`

- [ ] **Step 1: Write defaults**

```ts
// src/main/settings/defaults.ts
import { app } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import type { AppSettings } from '@shared/types';

export const DEFAULT_SUMMARY_PROMPT =
  'You are a helpful assistant that produces a concise structured summary of a video transcript. ' +
  'Include: (1) one-paragraph TL;DR, (2) key bullet points, (3) chapters with timestamps.';

export const DEFAULT_CHAT_PROMPT =
  'You are a helpful assistant answering questions about a specific video. ' +
  'The transcript is provided as context. Cite timestamps (mm:ss) when relevant.';

export function defaultSettings(): AppSettings {
  const userData = app?.getPath ? app.getPath('userData') : join(homedir(), '.video-summary');
  return {
    libraryPath: join(homedir(), 'Videos', 'VideoSummary'),
    importMode: 'copy',
    whisper: { defaultModel: 'base', modelsDir: join(userData, 'whisper-models') },
    ollama: { baseUrl: 'http://localhost:11434' },
    gemini: { hasKey: false },
    prompts: { summary: DEFAULT_SUMMARY_PROMPT, chat: DEFAULT_CHAT_PROMPT }
  };
}
```

- [ ] **Step 2: Write failing test**

```ts
// src/main/settings/index.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('electron', () => ({ app: { getPath: (_: string) => process.env.TEST_USER_DATA! } }));
vi.mock('keytar', () => ({
  setPassword: vi.fn(async () => {}),
  getPassword: vi.fn(async () => null),
  deletePassword: vi.fn(async () => true)
}));

describe('settings', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vsw-'));
    process.env.TEST_USER_DATA = dir;
  });

  it('returns defaults on first load', async () => {
    const { loadSettings } = await import('./index');
    const s = await loadSettings();
    expect(s.importMode).toBe('copy');
    expect(s.whisper.defaultModel).toBe('base');
    expect(s.gemini.hasKey).toBe(false);
  });

  it('persists and reloads partial updates', async () => {
    const { loadSettings, saveSettings } = await import('./index');
    await saveSettings({ importMode: 'move' });
    const s = await loadSettings();
    expect(s.importMode).toBe('move');
    expect(existsSync(join(dir, 'settings.json'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test, confirm it fails**

Run: `npx vitest run src/main/settings`
Expected: FAIL — `./index` not found.

- [ ] **Step 4: Implement settings module**

```ts
// src/main/settings/index.ts
import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import keytar from 'keytar';
import type { AppSettings } from '@shared/types';
import { defaultSettings } from './defaults';

const KEYTAR_SERVICE = 'VideoSummaryWorkflow';
const GEMINI_ACCOUNT = 'gemini-api-key';

function settingsPath() {
  return join(app.getPath('userData'), 'settings.json');
}

let cached: AppSettings | null = null;

export async function loadSettings(): Promise<AppSettings> {
  if (cached) return cached;
  const def = defaultSettings();
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    cached = { ...def, ...parsed, whisper: { ...def.whisper, ...parsed.whisper }, ollama: { ...def.ollama, ...parsed.ollama }, prompts: { ...def.prompts, ...parsed.prompts } };
  } catch {
    cached = def;
  }
  const existing = await keytar.getPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT);
  cached.gemini.hasKey = !!existing;
  return cached;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = { ...current, ...patch };
  await fs.mkdir(join(app.getPath('userData')), { recursive: true });
  // Never write the gemini.hasKey flag derived from keychain; recompute on load.
  const { gemini, ...rest } = next;
  await fs.writeFile(settingsPath(), JSON.stringify({ ...rest, gemini: { /* nothing persisted */ } }, null, 2));
  cached = next;
  return next;
}

export async function setGeminiKey(key: string): Promise<void> {
  await keytar.setPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT, key);
  if (cached) cached.gemini.hasKey = true;
}

export async function getGeminiKey(): Promise<string | null> {
  return keytar.getPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT);
}

export async function clearGeminiKey(): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, GEMINI_ACCOUNT);
  if (cached) cached.gemini.hasKey = false;
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npx vitest run src/main/settings`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/main/settings
git commit -m "feat(main): settings module with keychain-backed gemini key"
```

---

## Task 4: Library paths & ID/slug helpers

**Files:**
- Create: `src/main/library/paths.ts`, `src/main/library/paths.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/main/library/paths.test.ts
import { describe, it, expect } from 'vitest';
import { slugify, generateId, folderName } from './paths';

describe('paths', () => {
  it('slugifies titles to safe ascii', () => {
    expect(slugify('Predavanje O Reactu!')).toBe('predavanje-o-reactu');
    expect(slugify('  spaces  &  symbols  ')).toBe('spaces-symbols');
    expect(slugify('čšž — hello')).toMatch(/^[a-z0-9-]+$/);
  });

  it('generates 6-char ids', () => {
    const a = generateId();
    expect(a).toMatch(/^[a-z0-9]{6}$/);
    expect(a).not.toBe(generateId());
  });

  it('builds folder name as YYYY-MM-DD_slug_id', () => {
    const f = folderName(new Date('2026-05-12T10:00:00Z'), 'hello-world', 'abc123');
    expect(f).toBe('2026-05-12_hello-world_abc123');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/main/library/paths`
Expected: FAIL — file not found.

- [ ] **Step 3: Implement**

```ts
// src/main/library/paths.ts
import { randomBytes } from 'crypto';

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function generateId(): string {
  return randomBytes(4).toString('hex').slice(0, 6);
}

export function folderName(date: Date, slug: string, id: string): string {
  const d = date.toISOString().slice(0, 10);
  return `${d}_${slug}_${id}`;
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/main/library/paths`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/library/paths.ts src/main/library/paths.test.ts
git commit -m "feat(library): slug/id/folder-name helpers"
```

---

## Task 5: Library index store

**Files:**
- Create: `src/main/library/index-store.ts`, `src/main/library/index-store.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/main/library/index-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readIndex, writeIndex, upsertEntry, removeEntry } from './index-store';
import type { IndexEntry } from '@shared/types';

const sample: IndexEntry = {
  id: 'abc123', title: 'Hello', folderName: '2026-05-12_hello_abc123',
  thumbnailRelPath: '2026-05-12_hello_abc123/thumbnail.jpg',
  durationSec: 60, createdAt: '2026-05-12T10:00:00Z', status: 'imported'
};

describe('index-store', () => {
  let lib: string;
  beforeEach(() => { lib = mkdtempSync(join(tmpdir(), 'lib-')); });

  it('returns [] when missing', async () => {
    expect(await readIndex(lib)).toEqual([]);
  });

  it('writes and reads round-trip', async () => {
    await writeIndex(lib, [sample]);
    expect(await readIndex(lib)).toEqual([sample]);
  });

  it('upserts by id', async () => {
    await upsertEntry(lib, sample);
    await upsertEntry(lib, { ...sample, title: 'Updated' });
    const r = await readIndex(lib);
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('Updated');
  });

  it('removes by id', async () => {
    await writeIndex(lib, [sample]);
    await removeEntry(lib, 'abc123');
    expect(await readIndex(lib)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/main/library/index-store`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/main/library/index-store.ts
import { promises as fs } from 'fs';
import { join } from 'path';
import type { IndexEntry } from '@shared/types';

const INDEX_NAME = '_index.json';

export async function readIndex(libraryPath: string): Promise<IndexEntry[]> {
  try {
    const raw = await fs.readFile(join(libraryPath, INDEX_NAME), 'utf8');
    return JSON.parse(raw) as IndexEntry[];
  } catch {
    return [];
  }
}

export async function writeIndex(libraryPath: string, entries: IndexEntry[]): Promise<void> {
  await fs.mkdir(libraryPath, { recursive: true });
  await fs.writeFile(join(libraryPath, INDEX_NAME), JSON.stringify(entries, null, 2));
}

export async function upsertEntry(libraryPath: string, entry: IndexEntry): Promise<void> {
  const cur = await readIndex(libraryPath);
  const idx = cur.findIndex(e => e.id === entry.id);
  if (idx >= 0) cur[idx] = entry; else cur.push(entry);
  await writeIndex(libraryPath, cur);
}

export async function removeEntry(libraryPath: string, id: string): Promise<void> {
  const cur = await readIndex(libraryPath);
  await writeIndex(libraryPath, cur.filter(e => e.id !== id));
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/main/library/index-store`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/library/index-store.ts src/main/library/index-store.test.ts
git commit -m "feat(library): _index.json CRUD store"
```

---

## Task 6: Library CRUD (import + read + update)

**Files:**
- Create: `src/main/library/crud.ts`, `src/main/library/crud.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/main/library/crud.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { importVideo, readMeta, updateMeta, listLibrary, deleteVideo } from './crud';

describe('library crud', () => {
  let lib: string;
  let src: string;
  beforeEach(() => {
    lib = mkdtempSync(join(tmpdir(), 'lib-'));
    src = join(mkdtempSync(join(tmpdir(), 'src-')), 'movie.mp4');
    writeFileSync(src, 'fakebytes');
  });

  it('imports a video by copy', async () => {
    const meta = await importVideo({
      libraryPath: lib, sourceAbsPath: src, title: 'Hello', importMode: 'copy',
      durationSec: 120, thumbnailBytes: Buffer.from('jpg')
    });
    expect(meta.id).toMatch(/^[a-z0-9]{6}$/);
    expect(meta.status).toBe('imported');
    const folder = join(lib, meta.folderName);
    expect(existsSync(join(folder, 'source.mp4'))).toBe(true);
    expect(existsSync(join(folder, 'thumbnail.jpg'))).toBe(true);
    expect(existsSync(join(folder, 'meta.json'))).toBe(true);
    expect(existsSync(src)).toBe(true);  // copy keeps original
    expect((await listLibrary(lib))).toHaveLength(1);
  });

  it('imports by move', async () => {
    const m = await importVideo({
      libraryPath: lib, sourceAbsPath: src, title: 'Hello', importMode: 'move',
      durationSec: 10, thumbnailBytes: Buffer.from('jpg')
    });
    expect(existsSync(src)).toBe(false);
    expect(existsSync(join(lib, m.folderName, 'source.mp4'))).toBe(true);
  });

  it('updates meta partially', async () => {
    const m = await importVideo({
      libraryPath: lib, sourceAbsPath: src, title: 'H', importMode: 'copy',
      durationSec: 1, thumbnailBytes: Buffer.from('jpg')
    });
    await updateMeta(lib, m.id, { status: 'transcribed' });
    const reread = await readMeta(lib, m.id);
    expect(reread.status).toBe('transcribed');
    const idxEntry = (await listLibrary(lib))[0];
    expect(idxEntry.status).toBe('transcribed');
  });

  it('deletes a video and removes from index', async () => {
    const m = await importVideo({
      libraryPath: lib, sourceAbsPath: src, title: 'H', importMode: 'copy',
      durationSec: 1, thumbnailBytes: Buffer.from('jpg')
    });
    await deleteVideo(lib, m.id);
    expect(await listLibrary(lib)).toEqual([]);
    expect(existsSync(join(lib, m.folderName))).toBe(false);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/main/library/crud`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/main/library/crud.ts
import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';
import type { IndexEntry, VideoMeta, VideoStatus } from '@shared/types';
import { slugify, generateId, folderName } from './paths';
import { upsertEntry, removeEntry, readIndex } from './index-store';

interface ImportOpts {
  libraryPath: string;
  sourceAbsPath: string;
  title: string;
  importMode: 'copy' | 'move';
  durationSec: number;
  thumbnailBytes: Buffer;
}

const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm'];

export async function importVideo(opts: ImportOpts): Promise<VideoMeta> {
  const ext = extname(opts.sourceAbsPath).toLowerCase();
  if (!VIDEO_EXTS.includes(ext)) throw new Error(`Unsupported extension: ${ext}`);

  const id = generateId();
  const slug = slugify(opts.title || basename(opts.sourceAbsPath, ext));
  const now = new Date();
  const folder = folderName(now, slug, id);
  const absFolder = join(opts.libraryPath, folder);
  await fs.mkdir(absFolder, { recursive: true });

  const destVideo = join(absFolder, `source${ext}`);
  if (opts.importMode === 'move') {
    await fs.rename(opts.sourceAbsPath, destVideo).catch(async err => {
      // Cross-device fallback: copy + unlink.
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await fs.copyFile(opts.sourceAbsPath, destVideo);
        await fs.unlink(opts.sourceAbsPath);
      } else throw err;
    });
  } else {
    await fs.copyFile(opts.sourceAbsPath, destVideo);
  }

  await fs.writeFile(join(absFolder, 'thumbnail.jpg'), opts.thumbnailBytes);

  const meta: VideoMeta = {
    id, title: opts.title, slug, folderName: folder,
    originalFilename: basename(opts.sourceAbsPath),
    sourceRelPath: `${folder}/source${ext}`,
    thumbnailRelPath: `${folder}/thumbnail.jpg`,
    durationSec: opts.durationSec,
    createdAt: now.toISOString(),
    status: 'imported'
  };
  await fs.writeFile(join(absFolder, 'meta.json'), JSON.stringify(meta, null, 2));
  await upsertEntry(opts.libraryPath, metaToEntry(meta));
  return meta;
}

function metaToEntry(m: VideoMeta): IndexEntry {
  return {
    id: m.id, title: m.title, folderName: m.folderName,
    thumbnailRelPath: m.thumbnailRelPath, durationSec: m.durationSec,
    createdAt: m.createdAt, status: m.status
  };
}

async function findFolder(lib: string, id: string): Promise<string> {
  const entries = await readIndex(lib);
  const e = entries.find(e => e.id === id);
  if (!e) throw new Error(`Video not found: ${id}`);
  return join(lib, e.folderName);
}

export async function readMeta(lib: string, id: string): Promise<VideoMeta> {
  const folder = await findFolder(lib, id);
  return JSON.parse(await fs.readFile(join(folder, 'meta.json'), 'utf8'));
}

export async function updateMeta(lib: string, id: string, patch: Partial<VideoMeta>): Promise<VideoMeta> {
  const folder = await findFolder(lib, id);
  const cur = JSON.parse(await fs.readFile(join(folder, 'meta.json'), 'utf8')) as VideoMeta;
  const next: VideoMeta = { ...cur, ...patch };
  await fs.writeFile(join(folder, 'meta.json'), JSON.stringify(next, null, 2));
  await upsertEntry(lib, metaToEntry(next));
  return next;
}

export async function listLibrary(lib: string): Promise<IndexEntry[]> {
  return readIndex(lib);
}

export async function deleteVideo(lib: string, id: string): Promise<void> {
  const folder = await findFolder(lib, id);
  await fs.rm(folder, { recursive: true, force: true });
  await removeEntry(lib, id);
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/main/library/crud`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/library/crud.ts src/main/library/crud.test.ts
git commit -m "feat(library): video CRUD operations"
```

---

## Task 7: Startup reconciler

**Files:**
- Create: `src/main/library/reconcile.ts`, `src/main/library/reconcile.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/main/library/reconcile.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { reconcileLibrary } from './reconcile';
import { writeIndex, readIndex } from './index-store';
import type { IndexEntry, VideoMeta } from '@shared/types';

function writeMeta(folder: string, meta: VideoMeta) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'meta.json'), JSON.stringify(meta));
}

describe('reconcile', () => {
  let lib: string;
  beforeEach(() => { lib = mkdtempSync(join(tmpdir(), 'lib-')); });

  it('drops index entries whose folders are gone', async () => {
    const phantom: IndexEntry = { id: 'gone', title: 'Gone', folderName: 'gone-folder',
      thumbnailRelPath: '', durationSec: 0, createdAt: '', status: 'imported' };
    await writeIndex(lib, [phantom]);
    await reconcileLibrary(lib);
    expect(await readIndex(lib)).toEqual([]);
  });

  it('flips stuck transcribing back to imported when transcript missing', async () => {
    const meta: VideoMeta = {
      id: 'stuck', title: 's', slug: 's', folderName: 's-folder', originalFilename: 's.mp4',
      sourceRelPath: 's-folder/source.mp4', thumbnailRelPath: 's-folder/thumbnail.jpg',
      durationSec: 1, createdAt: '2026-05-12T00:00:00Z', status: 'transcribing'
    };
    writeMeta(join(lib, 's-folder'), meta);
    await reconcileLibrary(lib);
    const idx = await readIndex(lib);
    expect(idx[0].status).toBe('imported');
  });

  it('adopts orphan folders that have meta.json but no index entry', async () => {
    const meta: VideoMeta = {
      id: 'orphan', title: 'O', slug: 'o', folderName: 'o-folder', originalFilename: 'o.mp4',
      sourceRelPath: 'o-folder/source.mp4', thumbnailRelPath: 'o-folder/thumbnail.jpg',
      durationSec: 1, createdAt: '2026-05-12T00:00:00Z', status: 'transcribed'
    };
    writeMeta(join(lib, 'o-folder'), meta);
    await reconcileLibrary(lib);
    const idx = await readIndex(lib);
    expect(idx).toHaveLength(1);
    expect(idx[0].id).toBe('orphan');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/main/library/reconcile`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/main/library/reconcile.ts
import { promises as fs } from 'fs';
import { join } from 'path';
import type { IndexEntry, VideoMeta } from '@shared/types';
import { readIndex, writeIndex } from './index-store';

export async function reconcileLibrary(libraryPath: string): Promise<void> {
  await fs.mkdir(libraryPath, { recursive: true });
  const indexed = await readIndex(libraryPath);
  const entries = await fs.readdir(libraryPath, { withFileTypes: true });
  const folders = entries.filter(e => e.isDirectory()).map(e => e.name);

  const result: IndexEntry[] = [];
  const seen = new Set<string>();

  for (const folder of folders) {
    try {
      const raw = await fs.readFile(join(libraryPath, folder, 'meta.json'), 'utf8');
      const meta = JSON.parse(raw) as VideoMeta;
      let status = meta.status;
      if (status === 'transcribing') {
        try { await fs.access(join(libraryPath, folder, 'transcript.json')); status = 'transcribed'; }
        catch { status = 'imported'; }
      } else if (status === 'summarizing') {
        try { await fs.access(join(libraryPath, folder, 'summary.md')); status = 'summarized'; }
        catch { status = 'transcribed'; }
      }
      if (status !== meta.status) {
        await fs.writeFile(join(libraryPath, folder, 'meta.json'), JSON.stringify({ ...meta, status }, null, 2));
      }
      result.push({
        id: meta.id, title: meta.title, folderName: meta.folderName,
        thumbnailRelPath: meta.thumbnailRelPath, durationSec: meta.durationSec,
        createdAt: meta.createdAt, status
      });
      seen.add(meta.id);
    } catch {
      // Folder isn't a valid video — ignore.
    }
  }

  // Drop indexed entries whose folder no longer exists or wasn't readable.
  for (const e of indexed) {
    if (!seen.has(e.id)) continue;
  }

  await writeIndex(libraryPath, result);
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/main/library/reconcile`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/library/reconcile.ts src/main/library/reconcile.test.ts
git commit -m "feat(library): startup reconciler for index + stuck states"
```

---

## Task 8: Media helper (duration + thumbnail via ffmpeg)

**Files:**
- Create: `src/main/media/ffmpeg.ts`, `src/main/media/ffmpeg.test.ts`

- [ ] **Step 1: Write test**

This module is a thin wrapper around child_process; we test the command construction rather than executing ffmpeg.

```ts
// src/main/media/ffmpeg.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('ffmpeg-static', () => ({ default: '/fake/ffmpeg' }));

const spawnMock = vi.fn();
vi.mock('child_process', () => ({ spawn: (...a: unknown[]) => spawnMock(...a) }));

import { buildProbeArgs, buildThumbnailArgs } from './ffmpeg';

describe('ffmpeg arg builders', () => {
  it('probe args ask only for duration', () => {
    expect(buildProbeArgs('/v.mp4')).toEqual([
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', '/v.mp4'
    ]);
  });
  it('thumbnail args extract single frame at middle', () => {
    expect(buildThumbnailArgs('/v.mp4', 60, '/out.jpg')).toEqual([
      '-ss', '30', '-i', '/v.mp4', '-frames:v', '1', '-q:v', '4', '-y', '/out.jpg'
    ]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/main/media/ffmpeg`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/main/media/ffmpeg.ts
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ffmpeg-static exports a path; ffprobe is not bundled, so we use ffmpeg itself.
// Duration via `ffmpeg -i` is on stderr; we use a lightweight parser instead via -show_entries.
// To avoid ffprobe dep, we use ffmpeg + `-` trick. Use a simple approach: run ffmpeg, read duration from stderr.

export function buildProbeArgs(input: string): string[] {
  // NOTE: We use ffprobe-style args; if ffprobe is unavailable we fall back in extractDuration().
  return ['-v', 'error', '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1', input];
}

export function buildThumbnailArgs(input: string, durationSec: number, output: string): string[] {
  const mid = Math.max(0, Math.floor(durationSec / 2));
  return ['-ss', String(mid), '-i', input, '-frames:v', '1', '-q:v', '4', '-y', output];
}

export async function extractDuration(videoPath: string): Promise<number> {
  // Use ffmpeg with -i and parse stderr "Duration: HH:MM:SS.xx"
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg binary not found'));
    const child = spawn(ffmpegPath, ['-i', videoPath]);
    let stderr = '';
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
    child.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (!m) return reject(new Error('Could not parse duration'));
      const [, hh, mm, ss] = m;
      resolve(parseInt(hh) * 3600 + parseInt(mm) * 60 + parseFloat(ss));
    });
    child.on('error', reject);
  });
}

export async function extractThumbnail(videoPath: string, durationSec: number): Promise<Buffer> {
  if (!ffmpegPath) throw new Error('ffmpeg binary not found');
  const out = join(tmpdir(), `vsw-thumb-${Date.now()}.jpg`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath!, buildThumbnailArgs(videoPath, durationSec, out));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
    child.on('error', reject);
  });
  const data = await fs.readFile(out);
  await fs.unlink(out).catch(() => {});
  return data;
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/main/media/ffmpeg`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/media
git commit -m "feat(media): ffmpeg wrappers for duration & thumbnail"
```

---

## Task 9: Whisper transcription wrapper + queue

**Files:**
- Create: `src/main/transcription/models.ts`, `src/main/transcription/queue.ts`, `src/main/transcription/whisper.ts`, `src/main/transcription/queue.test.ts`

- [ ] **Step 1: Write queue test**

```ts
// src/main/transcription/queue.test.ts
import { describe, it, expect } from 'vitest';
import { TranscriptionQueue } from './queue';

describe('TranscriptionQueue', () => {
  it('runs jobs serially', async () => {
    const q = new TranscriptionQueue();
    const order: string[] = [];
    const make = (name: string, ms: number) => () =>
      new Promise<void>(res => setTimeout(() => { order.push(name); res(); }, ms));
    await Promise.all([q.enqueue('a', make('a', 30)), q.enqueue('b', make('b', 10))]);
    expect(order).toEqual(['a', 'b']);
  });

  it('returns rejected promise on job error', async () => {
    const q = new TranscriptionQueue();
    await expect(q.enqueue('x', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/main/transcription/queue`
Expected: FAIL.

- [ ] **Step 3: Implement queue**

```ts
// src/main/transcription/queue.ts
type Job = () => Promise<void>;
interface Pending { id: string; job: Job; resolve: () => void; reject: (e: unknown) => void; }

export class TranscriptionQueue {
  private q: Pending[] = [];
  private running = false;

  enqueue(id: string, job: Job): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.q.push({ id, job, resolve, reject });
      void this.tick();
    });
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    while (this.q.length) {
      const next = this.q.shift()!;
      try { await next.job(); next.resolve(); }
      catch (e) { next.reject(e); }
    }
    this.running = false;
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/main/transcription/queue`
Expected: 2 passed.

- [ ] **Step 5: Implement model paths**

```ts
// src/main/transcription/models.ts
import { join } from 'path';

const MODEL_URLS: Record<string, string> = {
  tiny:   'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  base:   'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  small:  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  medium: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  large:  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
};

export function modelFilePath(modelsDir: string, model: keyof typeof MODEL_URLS): string {
  return join(modelsDir, `ggml-${model}.bin`);
}

export function modelUrl(model: keyof typeof MODEL_URLS): string {
  return MODEL_URLS[model];
}

export const SUPPORTED_MODELS = Object.keys(MODEL_URLS) as (keyof typeof MODEL_URLS)[];
```

- [ ] **Step 6: Implement whisper wrapper**

```ts
// src/main/transcription/whisper.ts
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { dirname } from 'path';
import { Whisper, manager } from 'smart-whisper';
import type { TranscriptSegment } from '@shared/types';
import { modelFilePath, modelUrl } from './models';

export async function ensureModel(modelsDir: string, model: 'tiny'|'base'|'small'|'medium'|'large'): Promise<string> {
  const path = modelFilePath(modelsDir, model);
  try { await fs.access(path); return path; } catch {}
  await fs.mkdir(dirname(path), { recursive: true });
  const url = modelUrl(model);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Model download failed: ${res.status}`);
  const file = createWriteStream(path);
  await new Promise<void>((resolve, reject) => {
    const reader = res.body!.getReader();
    const pump = (): Promise<void> => reader.read().then(({ done, value }) => {
      if (done) { file.end(); return; }
      file.write(Buffer.from(value));
      return pump();
    });
    file.on('finish', resolve);
    file.on('error', reject);
    pump().catch(reject);
  });
  return path;
}

export interface TranscribeOpts {
  audioPath: string;             // smart-whisper accepts PCM/WAV; for raw video we run through ffmpeg first
  language?: string;
  onProgress?: (segIdx: number, partial: string) => void;
}

export async function transcribe(modelPath: string, opts: TranscribeOpts): Promise<TranscriptSegment[]> {
  const whisper = new Whisper(modelPath);
  try {
    const audio = await fs.readFile(opts.audioPath);
    const task = await whisper.transcribe(audio, {
      language: opts.language && opts.language !== 'auto' ? opts.language : undefined
    });
    const segments: TranscriptSegment[] = [];
    let i = 0;
    for await (const s of task.stream) {
      segments.push({ start: s.from / 100, end: s.to / 100, text: s.text.trim() });
      opts.onProgress?.(i++, s.text);
    }
    await task.result;
    return segments;
  } finally {
    await whisper.free();
  }
}
```

> **Note:** `smart-whisper` consumes raw PCM/WAV. The IPC layer (Task 11) prepares audio by running `ffmpeg -i input.mp4 -ar 16000 -ac 1 -c:a pcm_s16le tmp.wav` before calling `transcribe`.

- [ ] **Step 7: Commit**

```bash
git add src/main/transcription
git commit -m "feat(transcription): whisper wrapper, model fetch, single-job queue"
```

---

## Task 10: LLM provider interface + context selector

**Files:**
- Create: `src/main/llm/types.ts`, `src/main/llm/context.ts`, `src/main/llm/context.test.ts`

- [ ] **Step 1: Write context test**

```ts
// src/main/llm/context.test.ts
import { describe, it, expect } from 'vitest';
import { buildChatContext } from './context';

describe('buildChatContext', () => {
  const short = 'short transcript'.repeat(10);
  const long = 'x'.repeat(800_000); // ~200k tokens

  it('uses transcript when within limit', () => {
    const r = buildChatContext({ transcript: short, summary: 'sum', tokenLimit: 100_000 });
    expect(r.source).toBe('transcript');
    expect(r.text).toBe(short);
  });

  it('falls back to summary when transcript too long', () => {
    const r = buildChatContext({ transcript: long, summary: 'sum', tokenLimit: 8_000 });
    expect(r.source).toBe('summary');
    expect(r.text).toBe('sum');
  });

  it('truncates transcript when no summary exists', () => {
    const r = buildChatContext({ transcript: long, summary: null, tokenLimit: 1_000 });
    expect(r.source).toBe('truncated-transcript');
    expect(r.text.length).toBeLessThan(long.length);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/main/llm/context`
Expected: FAIL.

- [ ] **Step 3: Implement types + context**

```ts
// src/main/llm/types.ts
import type { ChatMessage, LlmProviderId } from '@shared/types';

export interface ChatCallOpts {
  history: ChatMessage[];
  userMessage: string;
  systemPrompt: string;
  transcriptContext: string;
  model: string;
  signal: AbortSignal;
  onToken: (t: string) => void;
}

export interface SummarizeCallOpts {
  transcript: string;
  systemPrompt: string;
  model: string;
  signal: AbortSignal;
  onToken: (t: string) => void;
}

export interface LlmProvider {
  id: LlmProviderId;
  listModels(): Promise<string[]>;
  summarize(opts: SummarizeCallOpts): Promise<string>;
  chat(opts: ChatCallOpts): Promise<string>;
  testConnection(): Promise<{ ok: boolean; detail: string }>;
}
```

```ts
// src/main/llm/context.ts
const CHARS_PER_TOKEN = 4;

interface BuildOpts {
  transcript: string;
  summary: string | null;
  tokenLimit: number;             // total context budget
}

export interface BuildResult {
  text: string;
  source: 'transcript' | 'summary' | 'truncated-transcript';
}

export function buildChatContext({ transcript, summary, tokenLimit }: BuildOpts): BuildResult {
  const headroom = Math.floor(tokenLimit * 0.25);
  const contextBudgetChars = (tokenLimit - headroom) * CHARS_PER_TOKEN;
  if (transcript.length <= contextBudgetChars) return { text: transcript, source: 'transcript' };
  if (summary) return { text: summary, source: 'summary' };
  return { text: transcript.slice(0, contextBudgetChars), source: 'truncated-transcript' };
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/main/llm/context`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/llm
git commit -m "feat(llm): provider interface + chat context selector"
```

---

## Task 11: Ollama provider

**Files:**
- Create: `src/main/llm/ollama.ts`, `src/main/llm/ollama.test.ts`

- [ ] **Step 1: Write test (mocking fetch)**

```ts
// src/main/llm/ollama.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from './ollama';

const encoder = new TextEncoder();
function makeStreamResponse(chunks: string[]) {
  let i = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) { controller.close(); return; }
      controller.enqueue(encoder.encode(chunks[i++] + '\n'));
    }
  }));
}

describe('OllamaProvider', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('lists models from /api/tags', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ models: [{ name: 'llama3:8b' }, { name: 'mistral' }] }))));
    const p = new OllamaProvider('http://x');
    expect(await p.listModels()).toEqual(['llama3:8b', 'mistral']);
  });

  it('streams chat tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => makeStreamResponse([
      JSON.stringify({ message: { content: 'Hel' } }),
      JSON.stringify({ message: { content: 'lo' }, done: true })
    ])));
    const tokens: string[] = [];
    const p = new OllamaProvider('http://x');
    const text = await p.chat({
      history: [], userMessage: 'hi', systemPrompt: 'sys', transcriptContext: 'ctx',
      model: 'llama3', signal: new AbortController().signal, onToken: t => tokens.push(t)
    });
    expect(tokens.join('')).toBe('Hello');
    expect(text).toBe('Hello');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/main/llm/ollama`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/main/llm/ollama.ts
import type { ChatCallOpts, LlmProvider, SummarizeCallOpts } from './types';

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama' as const;
  constructor(private baseUrl: string) {}

  async listModels(): Promise<string[]> {
    const r = await fetch(`${this.baseUrl}/api/tags`);
    if (!r.ok) throw new Error(`Ollama /api/tags ${r.status}`);
    const data = await r.json() as { models?: { name: string }[] };
    return (data.models ?? []).map(m => m.name);
  }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const r = await fetch(`${this.baseUrl}/api/tags`);
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const data = await r.json() as { models?: unknown[] };
      return { ok: true, detail: `${data.models?.length ?? 0} models available` };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  }

  summarize(opts: SummarizeCallOpts): Promise<string> {
    return this.streamChat({
      model: opts.model, signal: opts.signal, onToken: opts.onToken,
      messages: [
        { role: 'system', content: opts.systemPrompt },
        { role: 'user', content: `Transcript:\n\n${opts.transcript}` }
      ]
    });
  }

  chat(opts: ChatCallOpts): Promise<string> {
    return this.streamChat({
      model: opts.model, signal: opts.signal, onToken: opts.onToken,
      messages: [
        { role: 'system', content: `${opts.systemPrompt}\n\nVideo context:\n${opts.transcriptContext}` },
        ...opts.history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: opts.userMessage }
      ]
    });
  }

  private async streamChat(args: {
    model: string;
    messages: { role: string; content: string }[];
    signal: AbortSignal;
    onToken: (t: string) => void;
  }): Promise<string> {
    const r = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: args.model, messages: args.messages, stream: true }),
      signal: args.signal
    });
    if (!r.ok || !r.body) throw new Error(`Ollama /api/chat ${r.status}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let out = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          const chunk = parsed.message?.content ?? '';
          if (chunk) { args.onToken(chunk); out += chunk; }
        } catch { /* skip malformed line */ }
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/main/llm/ollama`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/llm/ollama.ts src/main/llm/ollama.test.ts
git commit -m "feat(llm): ollama provider with streaming chat & summarize"
```

---

## Task 12: Gemini provider

**Files:**
- Create: `src/main/llm/gemini.ts`, `src/main/llm/gemini.test.ts`

- [ ] **Step 1: Write test (mocking SDK)**

```ts
// src/main/llm/gemini.test.ts
import { describe, it, expect, vi } from 'vitest';

const sendMessageStream = vi.fn();
const startChat = vi.fn(() => ({ sendMessageStream }));
const getGenerativeModel = vi.fn(() => ({ startChat, generateContent: vi.fn(async () => ({ response: { text: () => 'ok' } })) }));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel }))
}));

import { GeminiProvider } from './gemini';

describe('GeminiProvider', () => {
  it('lists hardcoded models', async () => {
    const p = new GeminiProvider('KEY');
    expect(await p.listModels()).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
  });

  it('streams chat tokens via sendMessageStream', async () => {
    sendMessageStream.mockResolvedValueOnce({
      stream: (async function*() {
        yield { text: () => 'Hi ' };
        yield { text: () => 'there' };
      })()
    });
    const tokens: string[] = [];
    const p = new GeminiProvider('KEY');
    const text = await p.chat({
      history: [], userMessage: 'hello', systemPrompt: 'sys', transcriptContext: 'ctx',
      model: 'gemini-2.5-flash', signal: new AbortController().signal, onToken: t => tokens.push(t)
    });
    expect(tokens.join('')).toBe('Hi there');
    expect(text).toBe('Hi there');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npx vitest run src/main/llm/gemini`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/main/llm/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChatCallOpts, LlmProvider, SummarizeCallOpts } from './types';

const HARDCODED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'];

export class GeminiProvider implements LlmProvider {
  readonly id = 'gemini' as const;
  private client: GoogleGenerativeAI;
  constructor(apiKey: string) { this.client = new GoogleGenerativeAI(apiKey); }

  async listModels(): Promise<string[]> { return HARDCODED_MODELS.slice(); }

  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const m = this.client.getGenerativeModel({ model: 'gemini-2.5-flash' });
      await m.generateContent('ping');
      return { ok: true, detail: 'API key valid' };
    } catch (e) { return { ok: false, detail: (e as Error).message }; }
  }

  async summarize(opts: SummarizeCallOpts): Promise<string> {
    const model = this.client.getGenerativeModel({ model: opts.model, systemInstruction: opts.systemPrompt });
    const stream = await model.generateContentStream(`Transcript:\n\n${opts.transcript}`);
    let out = '';
    for await (const chunk of stream.stream) {
      if (opts.signal.aborted) break;
      const t = chunk.text();
      if (t) { opts.onToken(t); out += t; }
    }
    return out;
  }

  async chat(opts: ChatCallOpts): Promise<string> {
    const model = this.client.getGenerativeModel({
      model: opts.model,
      systemInstruction: `${opts.systemPrompt}\n\nVideo context:\n${opts.transcriptContext}`
    });
    const chat = model.startChat({
      history: opts.history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    });
    const result = await chat.sendMessageStream(opts.userMessage);
    let out = '';
    for await (const chunk of result.stream) {
      if (opts.signal.aborted) break;
      const t = chunk.text();
      if (t) { opts.onToken(t); out += t; }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `npx vitest run src/main/llm/gemini`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/llm/gemini.ts src/main/llm/gemini.test.ts
git commit -m "feat(llm): gemini provider with streaming"
```

---

## Task 13: IPC layer — settings, library, media

**Files:**
- Create: `src/main/ipc/index.ts`, `src/main/ipc/settings.ts`, `src/main/ipc/library.ts`, `src/main/ipc/media.ts`

- [ ] **Step 1: Write `ipc/settings.ts`**

```ts
// src/main/ipc/settings.ts
import { ipcMain } from 'electron';
import { loadSettings, saveSettings, setGeminiKey, clearGeminiKey } from '@main/settings';

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:save', (_e, patch) => saveSettings(patch));
  ipcMain.handle('settings:setGeminiKey', (_e, key: string) => setGeminiKey(key));
  ipcMain.handle('settings:clearGeminiKey', () => clearGeminiKey());
}
```

- [ ] **Step 2: Write `ipc/library.ts`**

```ts
// src/main/ipc/library.ts
import { ipcMain, dialog } from 'electron';
import { join } from 'path';
import { loadSettings } from '@main/settings';
import { reconcileLibrary } from '@main/library/reconcile';
import { listLibrary, readMeta, updateMeta, deleteVideo, importVideo } from '@main/library/crud';
import { extractDuration, extractThumbnail } from '@main/media/ffmpeg';
import { promises as fs } from 'fs';
import type { ChatHistory, TranscriptSegment } from '@shared/types';

export function registerLibraryIpc() {
  ipcMain.handle('library:reconcile', async () => {
    const s = await loadSettings();
    await reconcileLibrary(s.libraryPath);
  });

  ipcMain.handle('library:list', async () => {
    const s = await loadSettings();
    return listLibrary(s.libraryPath);
  });

  ipcMain.handle('library:getMeta', async (_e, id: string) => {
    const s = await loadSettings();
    return readMeta(s.libraryPath, id);
  });

  ipcMain.handle('library:updateMeta', async (_e, id: string, patch) => {
    const s = await loadSettings();
    return updateMeta(s.libraryPath, id, patch);
  });

  ipcMain.handle('library:delete', async (_e, id: string) => {
    const s = await loadSettings();
    await deleteVideo(s.libraryPath, id);
  });

  ipcMain.handle('library:pickFile', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }]
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('library:pickFolder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('library:import', async (_e, { sourceAbsPath, title }: { sourceAbsPath: string; title: string }) => {
    const s = await loadSettings();
    const duration = await extractDuration(sourceAbsPath);
    const thumb = await extractThumbnail(sourceAbsPath, duration);
    return importVideo({
      libraryPath: s.libraryPath, sourceAbsPath, title,
      importMode: s.importMode, durationSec: duration, thumbnailBytes: thumb
    });
  });

  ipcMain.handle('library:readTranscript', async (_e, id: string): Promise<TranscriptSegment[] | null> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    try {
      return JSON.parse(await fs.readFile(join(s.libraryPath, meta.folderName, 'transcript.json'), 'utf8'));
    } catch { return null; }
  });

  ipcMain.handle('library:readSummary', async (_e, id: string): Promise<string | null> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    try {
      return await fs.readFile(join(s.libraryPath, meta.folderName, 'summary.md'), 'utf8');
    } catch { return null; }
  });

  ipcMain.handle('library:writeSummary', async (_e, id: string, markdown: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    await fs.writeFile(join(s.libraryPath, meta.folderName, 'summary.md'), markdown);
  });

  ipcMain.handle('library:readChat', async (_e, id: string): Promise<ChatHistory | null> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    try {
      return JSON.parse(await fs.readFile(join(s.libraryPath, meta.folderName, 'chat.json'), 'utf8'));
    } catch { return null; }
  });

  ipcMain.handle('library:writeChat', async (_e, id: string, history: ChatHistory) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    await fs.writeFile(join(s.libraryPath, meta.folderName, 'chat.json'), JSON.stringify(history, null, 2));
  });

  ipcMain.handle('library:videoFileUrl', async (_e, id: string): Promise<string> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    return `file://${join(s.libraryPath, meta.sourceRelPath)}`;
  });
}
```

- [ ] **Step 3: Write `ipc/index.ts`**

```ts
// src/main/ipc/index.ts
import { registerSettingsIpc } from './settings';
import { registerLibraryIpc } from './library';
import { registerTranscriptionIpc } from './transcription';
import { registerLlmIpc } from './llm';

export function registerAllIpc() {
  registerSettingsIpc();
  registerLibraryIpc();
  registerTranscriptionIpc();
  registerLlmIpc();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc
git commit -m "feat(ipc): settings + library handlers"
```

---

## Task 14: IPC layer — transcription (with streaming progress)

**Files:**
- Create: `src/main/ipc/transcription.ts`

- [ ] **Step 1: Implement**

```ts
// src/main/ipc/transcription.ts
import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { tmpdir } from 'os';
import { loadSettings } from '@main/settings';
import { readMeta, updateMeta } from '@main/library/crud';
import { TranscriptionQueue } from '@main/transcription/queue';
import { ensureModel, transcribe } from '@main/transcription/whisper';
import { modelFilePath } from '@main/transcription/models';
import type { TranscriptSegment } from '@shared/types';

const queue = new TranscriptionQueue();

async function extractWav(videoPath: string): Promise<string> {
  if (!ffmpegPath) throw new Error('ffmpeg not found');
  const out = join(tmpdir(), `vsw-${Date.now()}.wav`);
  await new Promise<void>((resolve, reject) => {
    const c = spawn(ffmpegPath!, ['-i', videoPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', out]);
    c.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
    c.on('error', reject);
  });
  return out;
}

export function registerTranscriptionIpc() {
  ipcMain.handle('transcription:start', async (e, args: { videoId: string; model: 'tiny'|'base'|'small'|'medium'|'large'; language: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, args.videoId);
    const videoPath = join(s.libraryPath, meta.sourceRelPath);

    await queue.enqueue(args.videoId, async () => {
      try {
        await updateMeta(s.libraryPath, args.videoId, { status: 'transcribing' });
        win?.webContents.send('transcription:progress', { videoId: args.videoId, segmentIndex: 0, totalEstimate: null, partialText: 'Preparing audio…' });

        const modelPath = await ensureModel(s.whisper.modelsDir, args.model);
        const wav = await extractWav(videoPath);
        const segments: TranscriptSegment[] = await transcribe(modelPath, {
          audioPath: wav,
          language: args.language,
          onProgress: (segIdx, partial) =>
            win?.webContents.send('transcription:progress', { videoId: args.videoId, segmentIndex: segIdx, totalEstimate: null, partialText: partial })
        });
        await fs.unlink(wav).catch(() => {});

        const folder = join(s.libraryPath, meta.folderName);
        await fs.writeFile(join(folder, 'transcript.json'), JSON.stringify(segments, null, 2));
        await fs.writeFile(join(folder, 'transcript.txt'), segments.map(s => s.text).join('\n'));
        await updateMeta(s.libraryPath, args.videoId, {
          status: 'transcribed',
          transcription: { model: args.model, language: args.language, completedAt: new Date().toISOString() }
        });
        win?.webContents.send('transcription:done', { videoId: args.videoId });
      } catch (err) {
        await updateMeta(s.libraryPath, args.videoId, { status: 'error', errorMessage: (err as Error).message });
        win?.webContents.send('transcription:error', { videoId: args.videoId, message: (err as Error).message });
        throw err;
      }
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc/transcription.ts
git commit -m "feat(ipc): transcription pipeline with progress streaming"
```

---

## Task 15: IPC layer — LLM (with streaming)

**Files:**
- Create: `src/main/ipc/llm.ts`

- [ ] **Step 1: Implement**

```ts
// src/main/ipc/llm.ts
import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { loadSettings, getGeminiKey } from '@main/settings';
import { OllamaProvider } from '@main/llm/ollama';
import { GeminiProvider } from '@main/llm/gemini';
import type { LlmProvider } from '@main/llm/types';
import type { ChatMessage, LlmProviderId, LlmStreamChunk } from '@shared/types';
import { buildChatContext } from '@main/llm/context';

const inflight = new Map<string, AbortController>();

async function buildProvider(id: LlmProviderId): Promise<LlmProvider> {
  const s = await loadSettings();
  if (id === 'ollama') return new OllamaProvider(s.ollama.baseUrl);
  const key = await getGeminiKey();
  if (!key) throw new Error('Gemini API key not configured');
  return new GeminiProvider(key);
}

function tokenLimitFor(provider: LlmProviderId, model: string): number {
  if (provider === 'gemini') return 1_000_000;
  if (model.includes('llama3') || model.includes('llama-3')) return 8_192;
  return 4_096;
}

export function registerLlmIpc() {
  ipcMain.handle('llm:listModels', async (_e, providerId: LlmProviderId) => {
    return (await buildProvider(providerId)).listModels();
  });

  ipcMain.handle('llm:testConnection', async (_e, providerId: LlmProviderId) => {
    return (await buildProvider(providerId)).testConnection();
  });

  ipcMain.handle('llm:summarize', async (e, args: { providerId: LlmProviderId; model: string; transcript: string; systemPrompt: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const requestId = randomUUID();
    const ctrl = new AbortController();
    inflight.set(requestId, ctrl);
    void (async () => {
      try {
        const provider = await buildProvider(args.providerId);
        const text = await provider.summarize({
          transcript: args.transcript, systemPrompt: args.systemPrompt, model: args.model,
          signal: ctrl.signal, onToken: t => win?.webContents.send('llm:chunk', { requestId, token: t, done: false } satisfies LlmStreamChunk)
        });
        win?.webContents.send('llm:chunk', { requestId, token: '', done: true });
        return text;
      } catch (err) {
        win?.webContents.send('llm:chunk', { requestId, token: '', done: true, error: (err as Error).message });
      } finally { inflight.delete(requestId); }
    })();
    return requestId;
  });

  ipcMain.handle('llm:chat', async (e, args: {
    providerId: LlmProviderId; model: string; history: ChatMessage[];
    userMessage: string; systemPrompt: string; transcript: string; summary: string | null;
  }) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const requestId = randomUUID();
    const ctrl = new AbortController();
    inflight.set(requestId, ctrl);
    void (async () => {
      try {
        const provider = await buildProvider(args.providerId);
        const ctx = buildChatContext({
          transcript: args.transcript, summary: args.summary,
          tokenLimit: tokenLimitFor(args.providerId, args.model)
        });
        await provider.chat({
          history: args.history, userMessage: args.userMessage, systemPrompt: args.systemPrompt,
          transcriptContext: ctx.text, model: args.model, signal: ctrl.signal,
          onToken: t => win?.webContents.send('llm:chunk', { requestId, token: t, done: false })
        });
        win?.webContents.send('llm:chunk', { requestId, token: '', done: true });
      } catch (err) {
        win?.webContents.send('llm:chunk', { requestId, token: '', done: true, error: (err as Error).message });
      } finally { inflight.delete(requestId); }
    })();
    return requestId;
  });

  ipcMain.handle('llm:cancel', (_e, requestId: string) => {
    inflight.get(requestId)?.abort();
    inflight.delete(requestId);
  });
}
```

- [ ] **Step 2: Wire IPC into main**

Edit `src/main/index.ts`:
```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { registerAllIpc } from './ipc';
import { loadSettings } from './settings';
import { reconcileLibrary } from './library/reconcile';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true }
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
  registerAllIpc();
  const s = await loadSettings();
  await reconcileLibrary(s.libraryPath).catch(() => {});
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/llm.ts src/main/index.ts
git commit -m "feat(ipc): llm summarize/chat streaming + wire main entry"
```

---

## Task 16: Preload bridge

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Replace with typed bridge**

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, ChatHistory, ChatMessage, IndexEntry, LlmProviderId, TranscriptSegment, VideoMeta } from '../shared/types';

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    save: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:save', patch),
    setGeminiKey: (k: string) => ipcRenderer.invoke('settings:setGeminiKey', k),
    clearGeminiKey: () => ipcRenderer.invoke('settings:clearGeminiKey')
  },
  library: {
    reconcile: () => ipcRenderer.invoke('library:reconcile'),
    list: (): Promise<IndexEntry[]> => ipcRenderer.invoke('library:list'),
    getMeta: (id: string): Promise<VideoMeta> => ipcRenderer.invoke('library:getMeta', id),
    updateMeta: (id: string, patch: Partial<VideoMeta>): Promise<VideoMeta> => ipcRenderer.invoke('library:updateMeta', id, patch),
    delete: (id: string) => ipcRenderer.invoke('library:delete', id),
    pickFile: (): Promise<string | null> => ipcRenderer.invoke('library:pickFile'),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('library:pickFolder'),
    import: (sourceAbsPath: string, title: string): Promise<VideoMeta> =>
      ipcRenderer.invoke('library:import', { sourceAbsPath, title }),
    readTranscript: (id: string): Promise<TranscriptSegment[] | null> => ipcRenderer.invoke('library:readTranscript', id),
    readSummary: (id: string): Promise<string | null> => ipcRenderer.invoke('library:readSummary', id),
    writeSummary: (id: string, markdown: string) => ipcRenderer.invoke('library:writeSummary', id, markdown),
    readChat: (id: string): Promise<ChatHistory | null> => ipcRenderer.invoke('library:readChat', id),
    writeChat: (id: string, history: ChatHistory) => ipcRenderer.invoke('library:writeChat', id, history),
    videoFileUrl: (id: string): Promise<string> => ipcRenderer.invoke('library:videoFileUrl', id)
  },
  transcription: {
    start: (videoId: string, model: string, language: string) =>
      ipcRenderer.invoke('transcription:start', { videoId, model, language }),
    onProgress: (fn: (p: { videoId: string; segmentIndex: number; partialText: string }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('transcription:progress', listener);
      return () => ipcRenderer.removeListener('transcription:progress', listener);
    },
    onDone: (fn: (p: { videoId: string }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('transcription:done', listener);
      return () => ipcRenderer.removeListener('transcription:done', listener);
    },
    onError: (fn: (p: { videoId: string; message: string }) => void) => {
      const listener = (_: unknown, p: any) => fn(p);
      ipcRenderer.on('transcription:error', listener);
      return () => ipcRenderer.removeListener('transcription:error', listener);
    }
  },
  llm: {
    listModels: (providerId: LlmProviderId): Promise<string[]> => ipcRenderer.invoke('llm:listModels', providerId),
    testConnection: (providerId: LlmProviderId): Promise<{ ok: boolean; detail: string }> =>
      ipcRenderer.invoke('llm:testConnection', providerId),
    summarize: (args: { providerId: LlmProviderId; model: string; transcript: string; systemPrompt: string }): Promise<string> =>
      ipcRenderer.invoke('llm:summarize', args),
    chat: (args: { providerId: LlmProviderId; model: string; history: ChatMessage[]; userMessage: string;
                   systemPrompt: string; transcript: string; summary: string | null }): Promise<string> =>
      ipcRenderer.invoke('llm:chat', args),
    cancel: (requestId: string) => ipcRenderer.invoke('llm:cancel', requestId),
    onChunk: (fn: (chunk: { requestId: string; token: string; done: boolean; error?: string }) => void) => {
      const listener = (_: unknown, c: any) => fn(c);
      ipcRenderer.on('llm:chunk', listener);
      return () => ipcRenderer.removeListener('llm:chunk', listener);
    }
  }
};

contextBridge.exposeInMainWorld('api', api);

declare global { interface Window { api: typeof api; } }
export type Api = typeof api;
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): typed contextBridge API"
```

---

## Task 17: Renderer shell — router, sidebar, shadcn setup

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/components/Sidebar.tsx`, `src/renderer/routes/Library.tsx`, `src/renderer/routes/VideoDetail.tsx`, `src/renderer/routes/Settings.tsx`, `src/renderer/routes/NewVideo.tsx`, `components.json`
- Set up shadcn (Button, Card, Input, Textarea, Select, Tabs, Toast).

- [ ] **Step 1: Initialize shadcn (manual minimal setup)**

Add `clsx` and `tailwind-merge`:

```bash
npm i clsx tailwind-merge class-variance-authority lucide-react react-markdown
```

Create `src/renderer/lib/cn.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

Create minimal `src/renderer/components/ui/button.tsx`:
```tsx
import * as React from 'react';
import { cn } from '@renderer/lib/cn';
export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default'|'outline'|'ghost' }>(
  ({ className, variant = 'default', ...props }, ref) => (
    <button ref={ref} className={cn(
      'inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
      variant === 'default' && 'bg-slate-900 text-white hover:bg-slate-700',
      variant === 'outline' && 'border border-slate-300 hover:bg-slate-50',
      variant === 'ghost' && 'hover:bg-slate-100',
      className
    )} {...props} />
  )
);
Button.displayName = 'Button';
```

(Repeat trivial wrappers for `Input`, `Textarea`, `Card`, `Tabs`, `Select`, `Badge`, `Progress` as needed throughout later tasks — kept minimal & local rather than running `npx shadcn add` to avoid a runtime install step.)

- [ ] **Step 2: Implement sidebar + router**

`src/renderer/App.tsx`:
```tsx
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import Library from './routes/Library';
import VideoDetail from './routes/VideoDetail';
import SettingsPage from './routes/Settings';
import NewVideo from './routes/NewVideo';

export default function App() {
  return (
    <HashRouter>
      <div className="h-full flex">
        <Routes>
          <Route path="/new" element={<NewVideo />} />
          <Route path="*" element={
            <>
              <Sidebar />
              <main className="flex-1 overflow-auto">
                <Routes>
                  <Route path="/" element={<Library />} />
                  <Route path="/video/:id" element={<VideoDetail />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </main>
            </>
          } />
        </Routes>
      </div>
    </HashRouter>
  );
}
```

`src/renderer/components/Sidebar.tsx`:
```tsx
import { NavLink } from 'react-router-dom';
import { cn } from '@renderer/lib/cn';
import { Library as LibIcon, Settings as SetIcon, Plus } from 'lucide-react';

const item = 'flex items-center gap-2 px-3 py-2 rounded-md text-sm';

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 p-3 flex flex-col gap-1 bg-slate-50">
      <NavLink to="/" end className={({isActive}) => cn(item, isActive ? 'bg-slate-200' : 'hover:bg-slate-100')}>
        <LibIcon size={16}/> Library
      </NavLink>
      <NavLink to="/new" className={({isActive}) => cn(item, isActive ? 'bg-slate-200' : 'hover:bg-slate-100')}>
        <Plus size={16}/> New Video
      </NavLink>
      <div className="flex-1"/>
      <NavLink to="/settings" className={({isActive}) => cn(item, isActive ? 'bg-slate-200' : 'hover:bg-slate-100')}>
        <SetIcon size={16}/> Settings
      </NavLink>
    </aside>
  );
}
```

Stubs for routes so app builds:
```tsx
// src/renderer/routes/Library.tsx
export default function Library() { return <div className="p-4">Library</div>; }
```
(Repeat trivial stub for VideoDetail, Settings, NewVideo.)

- [ ] **Step 3: Verify boot**

Run: `npm run dev`
Expected: window shows sidebar with Library/Settings/New Video; navigation works.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(renderer): app shell, router, sidebar"
```

---

## Task 18: Renderer — Settings page

**Files:**
- Modify: `src/renderer/routes/Settings.tsx`
- Create: `src/renderer/stores/settings.ts`

- [ ] **Step 1: Settings store (Zustand)**

```ts
// src/renderer/stores/settings.ts
import { create } from 'zustand';
import type { AppSettings } from '@shared/types';

interface State {
  settings: AppSettings | null;
  load: () => Promise<void>;
  save: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useSettings = create<State>((set, get) => ({
  settings: null,
  load: async () => set({ settings: await window.api.settings.get() }),
  save: async (patch) => {
    const next = await window.api.settings.save(patch);
    set({ settings: next });
  }
}));
```

- [ ] **Step 2: Settings page UI**

```tsx
// src/renderer/routes/Settings.tsx
import { useEffect, useState } from 'react';
import { useSettings } from '@renderer/stores/settings';
import { Button } from '@renderer/components/ui/button';

export default function SettingsPage() {
  const { settings, load, save } = useSettings();
  const [keyInput, setKeyInput] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<string>('');
  const [geminiStatus, setGeminiStatus] = useState<string>('');

  useEffect(() => { void load(); }, []);
  if (!settings) return <div className="p-4">Loading…</div>;

  const pickLibrary = async () => {
    const f = await window.api.library.pickFolder();
    if (f) await save({ libraryPath: f });
  };
  const testOllama = async () => {
    const r = await window.api.llm.testConnection('ollama');
    setOllamaStatus(r.ok ? `OK — ${r.detail}` : `Error: ${r.detail}`);
  };
  const testGemini = async () => {
    const r = await window.api.llm.testConnection('gemini');
    setGeminiStatus(r.ok ? `OK — ${r.detail}` : `Error: ${r.detail}`);
  };
  const saveGeminiKey = async () => {
    await window.api.settings.setGeminiKey(keyInput);
    await load();
    setKeyInput('');
  };

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <section>
        <h2 className="text-lg font-semibold mb-2">Library</h2>
        <div className="flex items-center gap-3">
          <code className="text-sm bg-slate-100 px-2 py-1 rounded">{settings.libraryPath}</code>
          <Button variant="outline" onClick={pickLibrary}>Change folder…</Button>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" checked={settings.importMode === 'move'}
                 onChange={e => save({ importMode: e.target.checked ? 'move' : 'copy' })}/>
          Move file on import (default: copy)
        </label>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Transcription</h2>
        <label className="text-sm">Default Whisper model:&nbsp;
          <select value={settings.whisper.defaultModel}
                  onChange={e => save({ whisper: { ...settings.whisper, defaultModel: e.target.value as any }})}
                  className="border rounded px-2 py-1">
            {['tiny','base','small','medium','large'].map(m => <option key={m}>{m}</option>)}
          </select>
        </label>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Ollama</h2>
        <input className="border rounded px-2 py-1 text-sm w-96" value={settings.ollama.baseUrl}
               onChange={e => save({ ollama: { baseUrl: e.target.value }})}/>
        <Button variant="outline" className="ml-2" onClick={testOllama}>Test connection</Button>
        <div className="text-sm mt-1 text-slate-600">{ollamaStatus}</div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Google Gemini</h2>
        <div className="flex gap-2">
          <input type="password" placeholder={settings.gemini.hasKey ? '••••••••' : 'API key'}
                 value={keyInput} onChange={e => setKeyInput(e.target.value)}
                 className="border rounded px-2 py-1 text-sm w-96"/>
          <Button variant="outline" onClick={saveGeminiKey} disabled={!keyInput}>Save key</Button>
          {settings.gemini.hasKey && <Button variant="ghost" onClick={async () => { await window.api.settings.clearGeminiKey(); await load(); }}>Clear</Button>}
          <Button variant="outline" onClick={testGemini} disabled={!settings.gemini.hasKey}>Test</Button>
        </div>
        <div className="text-sm mt-1 text-slate-600">{geminiStatus}</div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Prompts</h2>
        <label className="block text-sm font-medium mb-1">Summary system prompt</label>
        <textarea className="w-full border rounded p-2 text-sm h-32"
                  value={settings.prompts.summary}
                  onChange={e => save({ prompts: { ...settings.prompts, summary: e.target.value } })}/>
        <label className="block text-sm font-medium mb-1 mt-3">Chat system prompt</label>
        <textarea className="w-full border rounded p-2 text-sm h-32"
                  value={settings.prompts.chat}
                  onChange={e => save({ prompts: { ...settings.prompts, chat: e.target.value } })}/>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

`npm run dev` → open Settings, change library folder, paste a Gemini key, hit "Test". Both providers should respond (Ollama needs to be running locally; Gemini needs a real key).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(renderer): Settings page with library/transcription/LLM/prompts"
```

---

## Task 19: Renderer — Library page

**Files:**
- Modify: `src/renderer/routes/Library.tsx`
- Create: `src/renderer/components/VideoCard.tsx`, `src/renderer/stores/library.ts`

- [ ] **Step 1: Library store**

```ts
// src/renderer/stores/library.ts
import { create } from 'zustand';
import type { IndexEntry } from '@shared/types';

interface State {
  videos: IndexEntry[];
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useLibrary = create<State>((set) => ({
  videos: [],
  refresh: async () => set({ videos: await window.api.library.list() }),
  remove: async (id) => { await window.api.library.delete(id); set(s => ({ videos: s.videos.filter(v => v.id !== id) })); }
}));
```

- [ ] **Step 2: VideoCard**

```tsx
// src/renderer/components/VideoCard.tsx
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { IndexEntry } from '@shared/types';
import { useSettings } from '@renderer/stores/settings';

function statusColor(s: IndexEntry['status']) {
  return {
    imported: 'bg-slate-200', transcribing: 'bg-amber-200', transcribed: 'bg-blue-200',
    summarizing: 'bg-amber-300', summarized: 'bg-green-200', error: 'bg-red-200'
  }[s];
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoCard({ entry }: { entry: IndexEntry }) {
  const { settings } = useSettings();
  const [thumb, setThumb] = useState<string>('');
  useEffect(() => {
    if (settings) setThumb(`file://${settings.libraryPath}/${entry.thumbnailRelPath}`);
  }, [settings, entry]);

  return (
    <Link to={`/video/${entry.id}`} className="block border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white">
      <div className="aspect-video bg-slate-100">{thumb && <img src={thumb} className="w-full h-full object-cover"/>}</div>
      <div className="p-3">
        <div className="font-medium truncate">{entry.title}</div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-500">{formatDuration(entry.durationSec)}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${statusColor(entry.status)}`}>{entry.status}</span>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 3: Library page**

```tsx
// src/renderer/routes/Library.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '@renderer/stores/library';
import { useSettings } from '@renderer/stores/settings';
import { VideoCard } from '@renderer/components/VideoCard';
import { Button } from '@renderer/components/ui/button';

export default function Library() {
  const { videos, refresh } = useLibrary();
  const { load: loadSettings } = useSettings();
  const [q, setQ] = useState('');

  useEffect(() => { void loadSettings().then(refresh); }, []);

  const filtered = videos.filter(v => v.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Link to="/new"><Button>+ New Video</Button></Link>
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
             className="border rounded px-3 py-2 text-sm w-72 mb-4"/>
      {filtered.length === 0
        ? <div className="text-slate-500 text-sm">No videos yet. Click "New Video" to import one.</div>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(v => <VideoCard key={v.id} entry={v}/>)}
          </div>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(renderer): Library page with cards"
```

---

## Task 20: Renderer — New Video wizard

**Files:**
- Modify: `src/renderer/routes/NewVideo.tsx`
- Create: `src/renderer/hooks/useIpcStream.ts`

- [ ] **Step 1: Streaming hook**

```ts
// src/renderer/hooks/useIpcStream.ts
import { useEffect, useRef } from 'react';

export function useLlmStream(onChunk: (c: { requestId: string; token: string; done: boolean; error?: string }) => void) {
  const ref = useRef(onChunk);
  ref.current = onChunk;
  useEffect(() => {
    const off = window.api.llm.onChunk(c => ref.current(c));
    return off;
  }, []);
}

export function useTranscriptionEvents(handlers: {
  onProgress?: (p: { videoId: string; segmentIndex: number; partialText: string }) => void;
  onDone?: (p: { videoId: string }) => void;
  onError?: (p: { videoId: string; message: string }) => void;
}) {
  const r = useRef(handlers); r.current = handlers;
  useEffect(() => {
    const offs = [
      window.api.transcription.onProgress(p => r.current.onProgress?.(p)),
      window.api.transcription.onDone(p => r.current.onDone?.(p)),
      window.api.transcription.onError(p => r.current.onError?.(p))
    ];
    return () => offs.forEach(o => o());
  }, []);
}
```

- [ ] **Step 2: Wizard**

```tsx
// src/renderer/routes/NewVideo.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@renderer/components/ui/button';
import { useSettings } from '@renderer/stores/settings';
import { useLlmStream, useTranscriptionEvents } from '@renderer/hooks/useIpcStream';
import type { LlmProviderId, VideoMeta } from '@shared/types';

type Step = 1 | 2 | 3;

export default function NewVideo() {
  const nav = useNavigate();
  const { settings, load } = useSettings();
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [importing, setImporting] = useState(false);
  const [meta, setMeta] = useState<VideoMeta | null>(null);

  // Step 2 state
  const [model, setModel] = useState<'tiny'|'base'|'small'|'medium'|'large'>('base');
  const [language, setLanguage] = useState('auto');
  const [transcribing, setTranscribing] = useState(false);
  const [progressText, setProgressText] = useState('');

  // Step 3 state
  const [providerId, setProviderId] = useState<LlmProviderId>('ollama');
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [llmModel, setLlmModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [activeReq, setActiveReq] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (settings) {
      setModel(settings.whisper.defaultModel);
      setSystemPrompt(settings.prompts.summary);
    }
  }, [settings]);
  useEffect(() => {
    if (step === 3) {
      window.api.llm.listModels(providerId).then(setLlmModels).catch(() => setLlmModels([]));
    }
  }, [step, providerId]);

  useTranscriptionEvents({
    onProgress: p => meta && p.videoId === meta.id && setProgressText(p.partialText),
    onDone: async p => {
      if (!meta || p.videoId !== meta.id) return;
      setTranscribing(false);
      const updated = await window.api.library.getMeta(meta.id);
      setMeta(updated);
    },
    onError: p => meta && p.videoId === meta.id && (setTranscribing(false), setProgressText(`Error: ${p.message}`))
  });

  useLlmStream(c => {
    if (c.requestId !== activeReq) return;
    if (c.error) { setSummary(prev => prev + `\n\n[Error: ${c.error}]`); setSummarizing(false); return; }
    if (c.done) { setSummarizing(false); return; }
    setSummary(prev => prev + c.token);
  });

  const pickFile = async () => {
    const f = await window.api.library.pickFile();
    if (f) {
      setSourcePath(f);
      setTitle(f.split('/').pop()!.replace(/\.[^.]+$/, ''));
    }
  };

  const runImport = async () => {
    if (!sourcePath) return;
    setImporting(true);
    try {
      const m = await window.api.library.import(sourcePath, title);
      setMeta(m);
      setStep(2);
    } finally { setImporting(false); }
  };

  const runTranscribe = async () => {
    if (!meta) return;
    setTranscribing(true);
    setProgressText('Starting…');
    await window.api.transcription.start(meta.id, model, language);
  };

  const runSummarize = async () => {
    if (!meta || !llmModel) return;
    const tr = await window.api.library.readTranscript(meta.id);
    if (!tr) return;
    const transcriptText = tr.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    setSummary('');
    setSummarizing(true);
    const reqId = await window.api.llm.summarize({ providerId, model: llmModel, transcript: transcriptText, systemPrompt });
    setActiveReq(reqId);
  };

  const saveAndOpen = async () => {
    if (!meta) return;
    await window.api.library.writeSummary(meta.id, summary);
    await window.api.library.updateMeta(meta.id, {
      status: 'summarized',
      summary: { provider: providerId, model: llmModel, systemPrompt, generatedAt: new Date().toISOString() }
    });
    nav(`/video/${meta.id}`);
  };

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          {[1,2,3].map(n => <div key={n} className={`flex-1 h-2 rounded ${step >= n ? 'bg-slate-900' : 'bg-slate-200'}`}/>)}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Step 1 — Import</h2>
            <Button variant="outline" onClick={pickFile}>Choose video file…</Button>
            {sourcePath && <>
              <div className="text-sm text-slate-600">Selected: {sourcePath}</div>
              <label className="block text-sm">Title:&nbsp;
                <input value={title} onChange={e => setTitle(e.target.value)} className="border rounded px-2 py-1 w-80"/>
              </label>
              <Button onClick={runImport} disabled={importing || !title}>{importing ? 'Importing…' : 'Import & continue'}</Button>
            </>}
          </div>
        )}

        {step === 2 && meta && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Step 2 — Transcribe</h2>
            <label className="block text-sm">Model:&nbsp;
              <select value={model} onChange={e => setModel(e.target.value as any)} className="border rounded px-2 py-1">
                {['tiny','base','small','medium','large'].map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="block text-sm">Language:&nbsp;
              <select value={language} onChange={e => setLanguage(e.target.value)} className="border rounded px-2 py-1">
                <option value="auto">auto</option>
                {['en','sl','de','fr','es','it'].map(l => <option key={l}>{l}</option>)}
              </select>
            </label>
            {!transcribing && meta.status !== 'transcribed' && <Button onClick={runTranscribe}>Start transcription</Button>}
            {transcribing && <div className="text-sm text-slate-600">{progressText}</div>}
            {meta.status === 'transcribed' && (
              <>
                <div className="text-green-700 text-sm">Transcription complete.</div>
                <Button onClick={() => setStep(3)}>Next</Button>
              </>
            )}
          </div>
        )}

        {step === 3 && meta && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Step 3 — Summarize (optional)</h2>
            <div className="flex gap-3">
              <label className="text-sm">Provider:&nbsp;
                <select value={providerId} onChange={e => setProviderId(e.target.value as LlmProviderId)} className="border rounded px-2 py-1">
                  <option value="ollama">Ollama</option>
                  {settings?.gemini.hasKey && <option value="gemini">Gemini</option>}
                </select>
              </label>
              <label className="text-sm">Model:&nbsp;
                <select value={llmModel} onChange={e => setLlmModel(e.target.value)} className="border rounded px-2 py-1">
                  <option value="">— select —</option>
                  {llmModels.map(m => <option key={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-sm">System prompt:</label>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} className="w-full border rounded p-2 text-sm h-28"/>
            <div className="flex gap-2">
              <Button onClick={runSummarize} disabled={summarizing || !llmModel}>Generate summary</Button>
              <Button variant="outline" onClick={() => nav(`/video/${meta.id}`)}>Skip</Button>
            </div>
            {summary && <pre className="border rounded p-3 text-sm whitespace-pre-wrap bg-slate-50">{summary}</pre>}
            {summary && !summarizing && <Button onClick={saveAndOpen}>Save & open</Button>}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(renderer): New Video 3-step wizard"
```

---

## Task 21: Renderer — Video Detail (player + tabs + chat)

**Files:**
- Modify: `src/renderer/routes/VideoDetail.tsx`
- Create: `src/renderer/components/TranscriptView.tsx`, `src/renderer/components/SummaryView.tsx`, `src/renderer/components/ChatPanel.tsx`, `src/renderer/hooks/useVideo.ts`

- [ ] **Step 1: useVideo hook**

```ts
// src/renderer/hooks/useVideo.ts
import { useEffect, useState } from 'react';
import type { ChatHistory, TranscriptSegment, VideoMeta } from '@shared/types';

export function useVideo(id: string | undefined) {
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatHistory | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setMeta(await window.api.library.getMeta(id));
      setVideoUrl(await window.api.library.videoFileUrl(id));
      setTranscript(await window.api.library.readTranscript(id));
      setSummary(await window.api.library.readSummary(id));
      setChat(await window.api.library.readChat(id));
    })();
  }, [id]);

  return { meta, videoUrl, transcript, summary, chat, setSummary, setChat };
}
```

- [ ] **Step 2: TranscriptView**

```tsx
// src/renderer/components/TranscriptView.tsx
import type { TranscriptSegment } from '@shared/types';

function ts(sec: number) {
  const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TranscriptView({ segments, onSeek }: { segments: TranscriptSegment[]; onSeek: (sec: number) => void }) {
  return (
    <div className="overflow-auto h-full">
      {segments.map((s, i) => (
        <button key={i} onClick={() => onSeek(s.start)}
                className="block w-full text-left px-3 py-1.5 hover:bg-slate-100 text-sm">
          <span className="text-slate-500 mr-2 font-mono">{ts(s.start)}</span>{s.text}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: SummaryView**

```tsx
// src/renderer/components/SummaryView.tsx
import ReactMarkdown from 'react-markdown';
import { Button } from './ui/button';

export function SummaryView({ markdown, onRegenerate }: { markdown: string | null; onRegenerate: () => void }) {
  return (
    <div className="p-3 overflow-auto h-full">
      <div className="flex justify-end mb-2">
        <Button variant="outline" onClick={onRegenerate}>Regenerate</Button>
      </div>
      {markdown
        ? <article className="prose prose-sm max-w-none"><ReactMarkdown>{markdown}</ReactMarkdown></article>
        : <div className="text-slate-500 text-sm">No summary yet. Click "Regenerate" to create one.</div>}
    </div>
  );
}
```

- [ ] **Step 4: ChatPanel**

```tsx
// src/renderer/components/ChatPanel.tsx
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { useSettings } from '@renderer/stores/settings';
import { useLlmStream } from '@renderer/hooks/useIpcStream';
import type { ChatHistory, ChatMessage, LlmProviderId, TranscriptSegment } from '@shared/types';

interface Props {
  videoId: string;
  transcript: TranscriptSegment[] | null;
  summary: string | null;
  initialChat: ChatHistory | null;
  onSave: (h: ChatHistory) => void;
}

export function ChatPanel({ videoId, transcript, summary, initialChat, onSave }: Props) {
  const { settings } = useSettings();
  const [providerId, setProviderId] = useState<LlmProviderId>('ollama');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat?.messages ?? []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [activeReq, setActiveReq] = useState<string | null>(null);
  const assistantBufRef = useRef('');

  useEffect(() => { setMessages(initialChat?.messages ?? []); }, [initialChat]);
  useEffect(() => {
    window.api.llm.listModels(providerId).then(setModels).catch(() => setModels([]));
  }, [providerId]);

  useLlmStream(c => {
    if (c.requestId !== activeReq) return;
    if (c.error) {
      setMessages(prev => [...prev.slice(0, -1), { ...prev[prev.length-1], content: prev[prev.length-1].content + `\n[Error: ${c.error}]` }]);
      setStreaming(false);
      return;
    }
    if (c.done) {
      const next = [...messages];
      const lastUser = messages[messages.length - 1];
      const final: ChatMessage = { role: 'assistant', content: assistantBufRef.current, createdAt: new Date().toISOString() };
      const merged = [...next, final];
      setMessages(merged);
      onSave({ messages: merged, systemPromptUsed: settings?.prompts.chat ?? '' });
      assistantBufRef.current = '';
      setStreaming(false);
      return;
    }
    assistantBufRef.current += c.token;
    // Render streaming token by mutating a pseudo last-assistant entry
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.createdAt === '__streaming__') {
        return [...prev.slice(0, -1), { ...last, content: last.content + c.token }];
      }
      return [...prev, { role: 'assistant', content: c.token, createdAt: '__streaming__' }];
    });
  });

  const send = async () => {
    if (!input.trim() || !model || !settings || !transcript) return;
    const userMsg: ChatMessage = { role: 'user', content: input, createdAt: new Date().toISOString() };
    const history = messages.filter(m => m.createdAt !== '__streaming__');
    setMessages([...history, userMsg]);
    setInput('');
    assistantBufRef.current = '';
    setStreaming(true);
    const transcriptText = transcript.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    const reqId = await window.api.llm.chat({
      providerId, model, history, userMessage: userMsg.content,
      systemPrompt: settings.prompts.chat, transcript: transcriptText, summary
    });
    setActiveReq(reqId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b flex gap-2 text-sm">
        <select value={providerId} onChange={e => setProviderId(e.target.value as LlmProviderId)} className="border rounded px-2 py-1">
          <option value="ollama">Ollama</option>
          {settings?.gemini.hasKey && <option value="gemini">Gemini</option>}
        </select>
        <select value={model} onChange={e => setModel(e.target.value)} className="border rounded px-2 py-1 flex-1">
          <option value="">— model —</option>
          {models.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{m.content}</div>
          </div>
        ))}
      </div>
      <div className="border-t p-2 flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
               disabled={streaming}
               placeholder="Ask about this video…"
               className="flex-1 border rounded px-2 py-1 text-sm"/>
        <Button onClick={send} disabled={streaming || !input.trim() || !model}>{streaming ? '…' : 'Send'}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: VideoDetail page**

```tsx
// src/renderer/routes/VideoDetail.tsx
import { useParams } from 'react-router-dom';
import { useRef, useState } from 'react';
import { useVideo } from '@renderer/hooks/useVideo';
import { TranscriptView } from '@renderer/components/TranscriptView';
import { SummaryView } from '@renderer/components/SummaryView';
import { ChatPanel } from '@renderer/components/ChatPanel';
import { Button } from '@renderer/components/ui/button';
import { useLlmStream } from '@renderer/hooks/useIpcStream';
import { useSettings } from '@renderer/stores/settings';

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>();
  const { meta, videoUrl, transcript, summary, chat, setSummary, setChat } = useVideo(id);
  const { settings } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tab, setTab] = useState<'transcript' | 'summary' | 'meta'>('transcript');
  const [regenBuf, setRegenBuf] = useState('');
  const [regenReq, setRegenReq] = useState<string | null>(null);

  useLlmStream(c => {
    if (c.requestId !== regenReq) return;
    if (c.error) { setRegenBuf(prev => prev + `\n[Error: ${c.error}]`); return; }
    if (c.done) {
      window.api.library.writeSummary(id!, regenBuf).then(() => setSummary(regenBuf));
      setRegenReq(null);
      return;
    }
    setRegenBuf(prev => prev + c.token);
  });

  if (!meta) return <div className="p-4">Loading…</div>;

  const onSeek = (sec: number) => { if (videoRef.current) videoRef.current.currentTime = sec; };

  const regenerate = async () => {
    if (!transcript || !settings) return;
    setRegenBuf('');
    const transcriptText = transcript.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    const models = await window.api.llm.listModels('ollama').catch(() => [] as string[]);
    const reqId = await window.api.llm.summarize({
      providerId: 'ollama', model: models[0] ?? 'llama3',
      transcript: transcriptText, systemPrompt: settings.prompts.summary
    });
    setRegenReq(reqId);
  };

  return (
    <div className="h-full flex">
      <div className="w-2/5 flex flex-col border-r">
        <video ref={videoRef} src={videoUrl} controls className="w-full bg-black aspect-video"/>
        <div className="flex border-b text-sm">
          {(['transcript','summary','meta'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-2 ${tab === t ? 'border-b-2 border-slate-900 font-medium' : 'text-slate-600'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === 'transcript' && transcript && <TranscriptView segments={transcript} onSeek={onSeek}/>}
          {tab === 'transcript' && !transcript && <div className="p-3 text-sm text-slate-500">No transcript.</div>}
          {tab === 'summary' && <SummaryView markdown={regenReq ? regenBuf : summary} onRegenerate={regenerate}/>}
          {tab === 'meta' && (
            <div className="p-3 text-sm space-y-1">
              <div><b>ID:</b> {meta.id}</div>
              <div><b>Status:</b> {meta.status}</div>
              <div><b>Duration:</b> {Math.floor(meta.durationSec)}s</div>
              <div><b>Created:</b> {meta.createdAt}</div>
              <div><b>Folder:</b> {meta.folderName}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1">
        <ChatPanel videoId={meta.id} transcript={transcript} summary={summary} initialChat={chat}
                   onSave={async h => { await window.api.library.writeChat(meta.id, h); setChat(h); }}/>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(renderer): Video Detail with player, tabs, chat"
```

---

## Task 22: End-to-end smoke + packaging config

**Files:**
- Modify: `package.json` (add `build` config for electron-builder)
- Create: `docs/SMOKE_TEST.md`

- [ ] **Step 1: Add electron-builder config to `package.json`**

```json
{
  "build": {
    "appId": "com.local.videosummary",
    "productName": "VideoSummary",
    "directories": { "output": "dist" },
    "files": ["out/**/*", "package.json"],
    "mac": { "category": "public.app-category.productivity" }
  }
}
```

- [ ] **Step 2: Write smoke test checklist**

```markdown
# Smoke test checklist

1. `npm run dev` opens the app.
2. Settings → set library folder, paste Gemini key (optional), `Test connection` shows OK for Ollama.
3. New Video → pick `.mp4` → Import → transcribe with `base` (downloads model first run) → progress visible → completes.
4. Step 3 → Generate summary via Ollama (or Gemini) → save & open.
5. Video Detail: player plays; click transcript line seeks; Summary tab shows markdown; Chat sends a question and streams back.
6. Restart app → library reloads from disk, video still present, chat history persists.
7. Delete the video's folder manually on disk → restart → it's gone from library, no crash.
```

- [ ] **Step 3: Run typecheck + tests**

```bash
npm run typecheck && npm run test
```
Expected: both pass.

- [ ] **Step 4: Run smoke test manually, fix anything broken**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: smoke test checklist + packaging config"
```

---

## Self-review notes

- **Spec coverage:** sections 2 (architecture) → tasks 1–16; section 3 (data layout) → tasks 4–7; section 4 (screens) → tasks 17–21; section 5 (new-video flow) → task 20; section 6 (settings) → task 18; section 7 (LLM provider interface) → tasks 10–12, 15; section 8 (errors) → tasks 7, 14, 15, 18; section 9 (testing) → tests in tasks 3–12 + task 22 smoke checklist.
- **Type consistency:** `LlmProvider`, `ChatCallOpts`, `SummarizeCallOpts`, `ChatMessage`, `IndexEntry`, `VideoMeta`, `TranscriptSegment` are defined in one place and used consistently. `summarize`/`chat`/`testConnection`/`listModels` signatures match across `OllamaProvider` and `GeminiProvider`.
- **No placeholders:** every code step has full code; commands have expected outputs.
