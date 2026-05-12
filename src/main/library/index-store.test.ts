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
