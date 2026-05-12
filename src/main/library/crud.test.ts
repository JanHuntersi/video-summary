import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'fs';
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
    expect(existsSync(src)).toBe(true);
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
