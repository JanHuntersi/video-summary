import { randomBytes } from 'crypto';
import type { SessionItem, SessionStage, SessionProgress } from '@shared/types';

interface InternalSession extends SessionItem {
  // Internal handles set by orchestration methods later (Tasks 4-6). Kept off the public type.
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
      progress: s.progress ? { ...s.progress } : null,
      startedAt: s.startedAt, error: s.error
    };
  }

  private emit() {
    for (const cb of this.listeners) { try { cb(); } catch { /* ignore */ } }
  }
}
