import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from './manager';

vi.mock('@main/ipc/ytdlp', () => {
  return {
    startDownload: vi.fn(async (args: any) => ({
      requestId: 'req_1',
      finished: Promise.resolve({
        id: 'vid_url',
        title: args.titleOverride ?? 'YT video',
        slug: 'y',
        folderName: 'f2',
        originalFilename: 'o',
        sourceRelPath: 'f2/source.mp4',
        thumbnailRelPath: 'f2/t.jpg',
        durationSec: 10,
        createdAt: '2026-05-21',
        status: 'imported' as const
      }),
      onProgress: (_cb: any) => () => {}
    })),
    cancelDownload: vi.fn(async () => {})
  };
});

vi.mock('@main/library/crud', () => ({
  importVideo: vi.fn(async (opts: { title: string }) => ({
    id: 'vid_1', title: opts.title, slug: 'x', folderName: 'f',
    originalFilename: 'o', sourceRelPath: 'f/source.mp4',
    thumbnailRelPath: 'f/t.jpg', durationSec: 1,
    createdAt: '2026-05-21', status: 'imported' as const
  })),
  readMeta: vi.fn(async (_lib: string, id: string) => ({
    id, title: 'T', slug: 'x', folderName: 'f',
    originalFilename: 'o', sourceRelPath: 'f/source.mp4',
    thumbnailRelPath: 'f/t.jpg', durationSec: 1,
    createdAt: '2026-05-21', status: 'imported' as const
  })),
  updateMeta: vi.fn(async () => ({}))
}));
vi.mock('@main/media/ffmpeg', () => ({
  extractDuration: vi.fn(async () => 1),
  extractThumbnail: vi.fn(async () => Buffer.from('x'))
}));

vi.mock('@main/transcription/transcribe-host', () => ({
  runTranscription: vi.fn(() => {
    const w = { terminate: vi.fn() };
    return {
      worker: w,
      result: Promise.resolve([{ start: 0, end: 1, text: 'hi' }]),
      cancel: () => w.terminate()
    };
  })
}));
vi.mock('@main/transcription/whisper', () => ({
  ensureModel: vi.fn(async () => '/m'),
  transcribe: vi.fn()
}));
vi.mock('@main/ipc/transcription', () => ({
  extractWav: vi.fn(async () => '/tmp/a.wav')
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: vi.fn(async () => {}),
      unlink: vi.fn(async () => {})
    }
  };
});

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

  it('stops firing after unsubscribe', () => {
    const m = new SessionManager();
    let calls = 0;
    const off = m.onChange(() => calls++);
    off();
    m.createForTest({ title: 'X', stage: 'imported' });
    expect(calls).toBe(0);
  });
});

describe('SessionManager.startLocal', () => {
  it('creates a session in importing-local, runs import, transitions to imported', async () => {
    const m = new SessionManager({
      libraryPath: '/tmp/lib',
      importMode: 'copy',
      autoTranscribe: false,
      autoSummarize: false
    });
    const seen: string[] = [];
    m.onChange(() => {
      const all = m.getAll();
      if (all[0]) seen.push(all[0].stage);
    });

    const id = await m.startLocal({ sourcePath: '/tmp/in.mp4', title: 'My Vid' });

    const final = m.get(id);
    expect(final?.stage).toBe('imported');
    expect(final?.videoId).toBe('vid_1');
    expect(seen).toContain('importing-local');
    expect(seen).toContain('imported');
  });

  it('marks session error on import failure', async () => {
    const { importVideo } = await import('@main/library/crud');
    (importVideo as any).mockRejectedValueOnce(new Error('disk full'));

    const m = new SessionManager({
      libraryPath: '/tmp/lib', importMode: 'copy',
      autoTranscribe: false, autoSummarize: false
    });
    const id = await m.startLocal({ sourcePath: '/tmp/in.mp4', title: 'Bad' });
    expect(m.get(id)?.stage).toBe('error');
    expect(m.get(id)?.error).toMatch(/disk full/);
  });
});

describe('SessionManager.startUrl', () => {
  it('starts in importing-url, transitions to imported on finish', async () => {
    const m = new SessionManager({
      libraryPath: '/tmp/lib', importMode: 'copy',
      autoTranscribe: false, autoSummarize: false
    });
    const id = await m.startUrl({ url: 'https://example.com/v', title: 'YT' });
    // The finished promise resolves on the next microtask; let it.
    await new Promise(r => setImmediate(r));
    expect(m.get(id)?.stage).toBe('imported');
    expect(m.get(id)?.videoId).toBe('vid_url');
  });
});

describe('SessionManager auto-transcribe', () => {
  it('transitions imported → transcribing → transcribed when autoTranscribe is on', async () => {
    const m = new SessionManager({
      libraryPath: '/tmp/lib', importMode: 'copy',
      autoTranscribe: true, autoSummarize: false,
      modelsDir: '/tmp/models', defaultModel: 'small',
      defaultLanguage: 'auto',
      defaultLlm: { providerId: 'ollama', model: '' },
      summaryPrompt: ''
    });
    const id = await m.startLocal({ sourcePath: '/tmp/x.mp4', title: 'T' });
    // Allow the scheduler microtasks to run.
    await new Promise(r => setTimeout(r, 20));
    expect(m.get(id)?.stage).toBe('transcribed');
  });
});

describe('SessionManager.cancel', () => {
  it('marks an importing-local session as cancelled', async () => {
    const m = new SessionManager();
    const id = m.createForTest({ title: 'A', stage: 'importing-local' });
    await m.cancel(id);
    expect(m.get(id)?.stage).toBe('cancelled');
  });

  it('cancel on a transcribing session calls cancelTranscription handle', async () => {
    const m = new SessionManager();
    const id = m.createForTest({ title: 'A', stage: 'transcribing' });
    const internal: any = (m as any).sessions.get(id);
    const cancelFn = vi.fn();
    internal.cancelTranscription = cancelFn;
    await m.cancel(id);
    expect(cancelFn).toHaveBeenCalled();
    expect(m.get(id)?.stage).toBe('cancelled');
  });
});

describe('SessionManager.dismiss', () => {
  it('removes a terminal session', () => {
    const m = new SessionManager();
    const id = m.createForTest({ title: 'A', stage: 'summarized' });
    m.dismiss(id);
    expect(m.get(id)).toBeNull();
  });

  it('throws when dismissing a non-terminal session', () => {
    const m = new SessionManager();
    const id = m.createForTest({ title: 'A', stage: 'transcribing' });
    expect(() => m.dismiss(id)).toThrow(/cancel first/i);
  });
});
