import { randomBytes } from 'crypto';
import type { SessionItem, SessionStage, SessionProgress } from '@shared/types';
import { importVideo } from '@main/library/crud';
import { extractDuration, extractThumbnail } from '@main/media/ffmpeg';
import { startDownload } from '@main/ipc/ytdlp';

interface InternalSession extends SessionItem {
  // Internal handles set by orchestration methods later (Tasks 4-6). Kept off the public type.
  ytdlpRequestId?: string;
  cancelTranscription?: () => void;
}

function makeId() {
  return 'sess_' + randomBytes(4).toString('hex');
}

export interface SessionManagerConfig {
  libraryPath: string;
  importMode: 'copy' | 'move';
  autoTranscribe: boolean;
  autoSummarize: boolean;
}

export class SessionManager {
  private sessions = new Map<string, InternalSession>();
  private listeners = new Set<() => void>();
  private cfg: SessionManagerConfig | null = null;

  constructor(cfg?: SessionManagerConfig) {
    if (cfg) this.cfg = cfg;
  }

  setConfig(cfg: SessionManagerConfig): void {
    this.cfg = cfg;
  }

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

  async startLocal(args: { sourcePath: string; title: string }): Promise<string> {
    if (!this.cfg) throw new Error('SessionManager: config not set');
    const id = makeId();
    const internal: InternalSession = {
      id, title: args.title, stage: 'importing-local',
      videoId: null,
      progress: { phase: 'import', message: 'Copying file…' },
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
      internal.progress = null;
      this.emit();
    }
    return id;
  }

  async startUrl(args: { url: string; title?: string }): Promise<string> {
    if (!this.cfg) throw new Error('SessionManager: config not set');
    const id = makeId();
    const internal: InternalSession = {
      id, title: args.title ?? args.url, stage: 'importing-url',
      videoId: null,
      progress: { phase: 'download', message: 'Starting…' },
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
      if (internal.stage === 'cancelled') return;
      internal.title = meta.title;
      internal.videoId = meta.id;
      internal.stage = 'imported';
      internal.progress = null;
      this.emit();
    }).catch(e => {
      if (internal.stage === 'cancelled') return;
      internal.stage = 'error';
      internal.error = (e as Error).message;
      internal.progress = null;
      this.emit();
    });

    return id;
  }

  private toPublic(s: InternalSession): SessionItem {
    return {
      id: s.id, title: s.title, stage: s.stage, videoId: s.videoId,
      progress: s.progress ? { ...s.progress } : null,
      startedAt: s.startedAt, error: s.error
    };
  }

  private emit() {
    for (const cb of this.listeners) { try { cb(); } catch { /* ignore */ } }
  }
}
