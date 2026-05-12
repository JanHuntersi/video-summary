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
