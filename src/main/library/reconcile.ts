import { promises as fs } from 'fs';
import { join } from 'path';
import type { IndexEntry, VideoMeta } from '@shared/types';
import { readIndex, writeIndex } from './index-store';

export async function reconcileLibrary(libraryPath: string): Promise<void> {
  await fs.mkdir(libraryPath, { recursive: true });
  const indexed = await readIndex(libraryPath);
  const entries = await fs.readdir(libraryPath, { withFileTypes: true });
  const folders = entries.filter(e => e.isDirectory()).map(e => e.name);

  const result: IndexEntry[] = [];
  const seen = new Set<string>();

  for (const folder of folders) {
    try {
      const raw = await fs.readFile(join(libraryPath, folder, 'meta.json'), 'utf8');
      const meta = JSON.parse(raw) as VideoMeta;
      let status = meta.status;
      if (status === 'transcribing') {
        try { await fs.access(join(libraryPath, folder, 'transcript.json')); status = 'transcribed'; }
        catch { status = 'imported'; }
      } else if (status === 'summarizing') {
        try { await fs.access(join(libraryPath, folder, 'summary.md')); status = 'summarized'; }
        catch { status = 'transcribed'; }
      }
      if (status !== meta.status) {
        await fs.writeFile(join(libraryPath, folder, 'meta.json'), JSON.stringify({ ...meta, status }, null, 2));
      }
      result.push({
        id: meta.id, title: meta.title, folderName: meta.folderName,
        thumbnailRelPath: meta.thumbnailRelPath, durationSec: meta.durationSec,
        createdAt: meta.createdAt, status
      });
      seen.add(meta.id);
    } catch {
      // Folder isn't a valid video — ignore.
    }
  }

  // Drop indexed entries whose folder no longer exists or wasn't readable.
  for (const e of indexed) {
    if (!seen.has(e.id)) continue;
  }

  await writeIndex(libraryPath, result);
}
