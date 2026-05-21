import { randomBytes } from 'crypto';
import type { SessionItem, SessionStage, SessionProgress } from '@shared/types';
import { importVideo } from '@main/library/crud';
import { extractDuration, extractThumbnail } from '@main/media/ffmpeg';

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
