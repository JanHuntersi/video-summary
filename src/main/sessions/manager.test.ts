import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from './manager';

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
