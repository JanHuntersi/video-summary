import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { SessionItem, SessionStage, SessionProgress, TranscriptSegment, LlmProviderId } from '@shared/types';
import { importVideo, readMeta, updateMeta } from '@main/library/crud';
import { extractDuration, extractThumbnail } from '@main/media/ffmpeg';
import { startDownload, cancelDownload } from '@main/ipc/ytdlp';
import { extractWav } from '@main/ipc/transcription';
import { ensureModel } from '@main/transcription/whisper';
import { runTranscription } from '@main/transcription/transcribe-host';
import type { ModelName } from '@main/transcription/models';
import { TranscriptionScheduler } from './scheduler';
import { OllamaProvider } from '@main/llm/ollama';
import { GeminiProvider } from '@main/llm/gemini';
import type { LlmProvider } from '@main/llm/types';

interface InternalSession extends SessionItem {
  // Internal handles set by orchestration methods later (Tasks 4-6). Kept off the public type.
  ytdlpRequestId?: string;
  cancelTranscription?: () => void;
  summaryAbort?: AbortController;
}

function makeId() {
  return 'sess_' + randomBytes(4).toString('hex');
}

export interface SessionManagerConfig {
  libraryPath: string;
  importMode: 'copy' | 'move';
  autoTranscribe: boolean;
  autoSummarize: boolean;
  // Optional — only needed when autoTranscribe / autoSummarize are enabled.
  // Tests from earlier tasks that pass the minimal 4-field shape continue to work.
  modelsDir?: string;
  defaultModel?: ModelName;
  defaultLanguage?: string;
  defaultLlm?: { providerId: LlmProviderId; model: string };
  summaryPrompt?: string;
  // Gemini API key (read from keychain at config time in IPC layer / Task 7).
  // If absent and the provider is gemini, the auto-summary step is skipped with an error.
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
}

export class SessionManager {
  private sessions = new Map<string, InternalSession>();
  private listeners = new Set<() => void>();
  private cfg: SessionManagerConfig | null = null;
  private scheduler = new TranscriptionScheduler();

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
      await this.maybeAutoTranscribe(internal);
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
      // Fire-and-forget — caller already received id back from startUrl.
      void this.maybeAutoTranscribe(internal);
    }).catch(e => {
      if (internal.stage === 'cancelled') return;
      internal.stage = 'error';
      internal.error = (e as Error).message;
      internal.progress = null;
      this.emit();
    });

    return id;
  }

  async cancel(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    switch (s.stage) {
      case 'importing-url':
        if (s.ytdlpRequestId) {
          await cancelDownload(s.ytdlpRequestId).catch(() => { /* best-effort */ });
        }
        break;
      case 'transcribing':
        s.cancelTranscription?.();
        this.scheduler.cancel(id); // no-op if already running, drops if still queued
        break;
      case 'imported':
        this.scheduler.cancel(id);
        break;
      case 'importing-local':
        // Local copy is fast/synchronous-ish — best-effort no-op cancel.
        break;
      case 'summarizing':
        // Abort the in-flight LLM call. The promise rejects (AbortError); the
        // maybeAutoSummarize catch path sees stage === 'cancelled' and exits quietly.
        s.summaryAbort?.abort();
        break;
      case 'summarized':
      case 'transcribed':
      case 'cancelled':
      case 'error':
        // Already terminal; nothing to cancel.
        return;
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

  private async maybeAutoTranscribe(internal: InternalSession): Promise<void> {
    if (!this.cfg?.autoTranscribe || !internal.videoId) return;
    if (!this.cfg.modelsDir || !this.cfg.defaultModel) return; // misconfigured — skip silently
    const videoId = internal.videoId;

    internal.stage = 'transcribing';
    internal.progress = { phase: 'transcribe', message: 'Queued…' };
    this.emit();

    try {
      await this.scheduler.submit(internal.id, async () => {
        if ((internal.stage as SessionStage) === 'cancelled') return;
        internal.progress = { phase: 'transcribe', message: 'Extracting audio…' };
        this.emit();

        const meta = await readMeta(this.cfg!.libraryPath, videoId);
        const videoPath = join(this.cfg!.libraryPath, meta.sourceRelPath);
        const wav = await extractWav(videoPath);

        const modelPath = await ensureModel(this.cfg!.modelsDir!, this.cfg!.defaultModel!);
        const handle = runTranscription({
          modelPath,
          audioPath: wav,
          language: this.cfg!.defaultLanguage ?? 'auto',
          onProgress: (_i, partial) => {
            internal.progress = { phase: 'transcribe', message: partial };
            this.emit();
          }
        });
        internal.cancelTranscription = () => handle.cancel();

        let segments: TranscriptSegment[];
        try {
          segments = await handle.result;
        } finally {
          await fs.unlink(wav).catch(() => {});
          internal.cancelTranscription = undefined;
        }

        if ((internal.stage as SessionStage) === 'cancelled') return;

        const folder = join(this.cfg!.libraryPath, meta.folderName);
        await fs.writeFile(join(folder, 'transcript.json'), JSON.stringify(segments, null, 2));
        await fs.writeFile(join(folder, 'transcript.txt'), segments.map(seg => seg.text).join('\n'));
        await updateMeta(this.cfg!.libraryPath, videoId, {
          status: 'transcribed',
          transcription: {
            model: this.cfg!.defaultModel!,
            language: this.cfg!.defaultLanguage ?? 'auto',
            completedAt: new Date().toISOString()
          }
        });

        internal.stage = 'transcribed';
        internal.progress = null;
        this.emit();

        await this.maybeAutoSummarize(internal, segments);
      });
    } catch (e) {
      if ((internal.stage as SessionStage) === 'cancelled') return;
      internal.stage = 'error';
      internal.error = (e as Error).message;
      internal.progress = null;
      this.emit();
    }
  }

  private async maybeAutoSummarize(internal: InternalSession, segments: TranscriptSegment[]): Promise<void> {
    if (!this.cfg?.autoSummarize) return;
    if (!this.cfg.defaultLlm?.providerId || !this.cfg.defaultLlm.model) return;
    if (!internal.videoId) return;
    const videoId = internal.videoId;

    internal.stage = 'summarizing';
    internal.progress = { phase: 'summary', message: 'Generating…' };
    this.emit();

    try {
      const transcriptText = segments.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');

      let provider: LlmProvider;
      if (this.cfg.defaultLlm.providerId === 'gemini') {
        if (!this.cfg.geminiApiKey) {
          throw new Error('Gemini API key missing — pass geminiApiKey in SessionManagerConfig');
        }
        provider = new GeminiProvider(this.cfg.geminiApiKey);
      } else {
        // Ollama — defaults to localhost:11434 if no baseUrl supplied (test path).
        provider = new OllamaProvider(this.cfg.ollamaBaseUrl ?? 'http://localhost:11434');
      }

      const ac = new AbortController();
      internal.summaryAbort = ac;

      const markdown = await provider.summarize({
        transcript: transcriptText,
        systemPrompt: this.cfg.summaryPrompt ?? '',
        model: this.cfg.defaultLlm.model,
        signal: ac.signal,
        onToken: (_t) => { /* token-level progress could be forwarded later */ }
      });

      internal.summaryAbort = undefined;

      if ((internal.stage as SessionStage) === 'cancelled') return;

      const meta = await readMeta(this.cfg.libraryPath, videoId);
      const folder = join(this.cfg.libraryPath, meta.folderName);
      await fs.writeFile(join(folder, 'summary.md'), markdown);
      await updateMeta(this.cfg.libraryPath, videoId, {
        status: 'summarized',
        summary: {
          provider: this.cfg.defaultLlm.providerId,
          model: this.cfg.defaultLlm.model,
          systemPrompt: this.cfg.summaryPrompt ?? '',
          generatedAt: new Date().toISOString()
        }
      });

      internal.stage = 'summarized';
      internal.progress = null;
      this.emit();
    } catch (e) {
      internal.summaryAbort = undefined;
      if ((internal.stage as SessionStage) === 'cancelled') return;
      internal.stage = 'error';
      internal.error = (e as Error).message;
      internal.progress = null;
      this.emit();
    }
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
