import { promises as fs } from 'fs';
import { join } from 'path';
import type { IndexEntry } from '@shared/types';

const INDEX_NAME = '_index.json';

export async function readIndex(libraryPath: string): Promise<IndexEntry[]> {
  try {
    const raw = await fs.readFile(join(libraryPath, INDEX_NAME), 'utf8');
    return JSON.parse(raw) as IndexEntry[];
  } catch {
    return [];
  }
}

export async function writeIndex(libraryPath: string, entries: IndexEntry[]): Promise<void> {
  await fs.mkdir(libraryPath, { recursive: true });
  await fs.writeFile(join(libraryPath, INDEX_NAME), JSON.stringify(entries, null, 2));
}

export async function upsertEntry(libraryPath: string, entry: IndexEntry): Promise<void> {
  const cur = await readIndex(libraryPath);
  const idx = cur.findIndex(e => e.id === entry.id);
  if (idx >= 0) cur[idx] = entry; else cur.push(entry);
  await writeIndex(libraryPath, cur);
}

export async function removeEntry(libraryPath: string, id: string): Promise<void> {
  const cur = await readIndex(libraryPath);
  await writeIndex(libraryPath, cur.filter(e => e.id !== id));
}
