// src/main/ipc/ytdlp.ts
import { ipcMain, BrowserWindow } from 'electron';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { loadSettings } from '@main/settings';
import { importVideo } from '@main/library/crud';
import { extractDuration, extractThumbnail } from '@main/media/ffmpeg';
import type { VideoMeta } from '@shared/types';

interface InFlight {
  child?: ChildProcess;
  canceled: boolean;
}

const inflight = new Map<string, InFlight>();

function checkYtDlp(): void {
  const r = spawnSync('which', ['yt-dlp']);
  if (r.status !== 0 || !r.stdout || r.stdout.toString().trim().length === 0) {
    throw new Error('yt-dlp not installed. Install with: brew install yt-dlp');
  }
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

async function ytDlpJson(url: string): Promise<{ title: string; durationSec: number; thumbnailUrl?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', ['-J', '--no-playlist', url]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b: Buffer) => { stdout += b.toString(); });
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp probe failed: ${stderr || 'exit ' + code}`));
      try {
        const data = JSON.parse(stdout);
        resolve({
          title: typeof data.title === 'string' ? data.title : 'Untitled',
          durationSec: typeof data.duration === 'number' ? data.duration : 0,
          thumbnailUrl: typeof data.thumbnail === 'string' ? data.thumbnail : undefined
        });
      } catch (e) {
        reject(new Error('Failed to parse yt-dlp JSON: ' + (e as Error).message));
      }
    });
  });
}

async function downloadVideoWithProgress(
  url: string,
  tempDir: string,
  requestId: string,
  emitProgress: (e: { phase: string; message: string }) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'bv*+ba/b',
      '--merge-output-format', 'mp4',
      '-o', join(tempDir, '%(title).200B.%(ext)s'),
      '--print', 'after_move:filepath',
      '--no-playlist',
      '--no-warnings',
      url
    ];
    const child = spawn('yt-dlp', args);
    const entry = inflight.get(requestId);
    if (entry) entry.child = child;

    let stdout = '';
    let stderr = '';
    let lastPercent = -1;

    child.stdout.on('data', (b: Buffer) => {
      stdout += b.toString();
    });
    child.stderr.on('data', (b: Buffer) => {
      const text = b.toString();
      stderr += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.startsWith('[download]')) {
          const m = line.match(/(\d+\.?\d*)%/);
          if (m) {
            const p = parseFloat(m[1]);
            if (Math.floor(p) !== lastPercent) {
              lastPercent = Math.floor(p);
              // Legacy broadcast for NewVideo.tsx
              broadcast('ytdlp:progress', {
                requestId,
                phase: 'downloading',
                message: line.trim()
              });
              // New progress emitter for session listeners
              emitProgress({ phase: 'downloading', message: line.trim() });
            }
          }
        } else if (line.startsWith('[Merger]') || line.toLowerCase().includes('merging')) {
          // Legacy broadcast for NewVideo.tsx
          broadcast('ytdlp:progress', {
            requestId,
            phase: 'merging',
            message: line.trim()
          });
          // New progress emitter for session listeners
          emitProgress({ phase: 'merging', message: line.trim() });
        }
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const entry = inflight.get(requestId);
      if (entry?.canceled) return reject(new Error('Canceled'));
      if (code !== 0) return reject(new Error(`yt-dlp failed: ${stderr.split('\n').slice(-5).join('\n')}`));
      // Parse stdout for the final filepath (last non-empty line).
      const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const filepath = lines[lines.length - 1];
      if (!filepath) return reject(new Error('yt-dlp did not report downloaded filepath'));
      resolve(filepath);
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DownloadHandle {
  requestId: string;
  finished: Promise<VideoMeta>;
  onProgress: (cb: (e: { phase: string; message: string }) => void) => () => void;
}

export interface StartDownloadOpts {
  url: string;
  titleOverride?: string;
  libraryPath: string;
}

export async function startDownload(opts: StartDownloadOpts): Promise<DownloadHandle> {
  checkYtDlp();
  const requestId = randomUUID();
  inflight.set(requestId, { canceled: false });

  const progressListeners = new Set<(e: { phase: string; message: string }) => void>();
  const emitProgress = (e: { phase: string; message: string }) => {
    for (const cb of progressListeners) { try { cb(e); } catch { /* ignore */ } }
  };

  const finished = (async () => {
    let tempDir: string | null = null;
    try {
      emitProgress({ phase: 'downloading', message: 'Fetching metadata…' });
      const probe = await ytDlpJson(opts.url);
      const title = opts.titleOverride?.trim() || probe.title;

      tempDir = await mkdtemp(join(tmpdir(), 'vsw-yt-'));
      const downloadedPath = await downloadVideoWithProgress(opts.url, tempDir, requestId, emitProgress);

      const entry = inflight.get(requestId);
      if (entry?.canceled) throw new Error('Canceled');

      emitProgress({ phase: 'merging', message: 'Finalizing…' });

      const duration = await extractDuration(downloadedPath);
      const thumb = await extractThumbnail(downloadedPath, duration);
      const meta: VideoMeta = await importVideo({
        libraryPath: opts.libraryPath,
        sourceAbsPath: downloadedPath,
        title,
        importMode: 'move',
        durationSec: duration,
        thumbnailBytes: thumb
      });

      emitProgress({ phase: 'done', message: 'Import complete' });
      return meta;
    } finally {
      if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      inflight.delete(requestId);
    }
  })();

  return {
    requestId,
    finished,
    onProgress: (cb) => { progressListeners.add(cb); return () => progressListeners.delete(cb); }
  };
}

export async function cancelDownload(requestId: string): Promise<void> {
  const entry = inflight.get(requestId);
  if (!entry) return;
  entry.canceled = true;
  try { entry.child?.kill('SIGTERM'); } catch { /* ignore */ }
}

// ── IPC registration ──────────────────────────────────────────────────────────

export function registerYtdlpIpc() {
  ipcMain.handle('library:probeUrl', async (_e, url: string) => {
    checkYtDlp();
    return ytDlpJson(url);
  });

  ipcMain.handle('library:startUrlImport', async (_e, args: { url: string; titleOverride?: string }) => {
    const s = await loadSettings();
    const dl = await startDownload({ url: args.url, titleOverride: args.titleOverride, libraryPath: s.libraryPath });
    // The legacy broadcast channels (ytdlp:progress) are already emitted inside downloadVideoWithProgress.
    // Broadcast done/error for the existing NewVideo subscribers:
    dl.finished
      .then(meta => broadcast('ytdlp:done', { requestId: dl.requestId, meta }))
      .catch(err => broadcast('ytdlp:error', { requestId: dl.requestId, message: (err as Error).message }));
    return { requestId: dl.requestId };
  });

  ipcMain.handle('ytdlp:cancel', async (_e, requestId: string) => cancelDownload(requestId));
}
