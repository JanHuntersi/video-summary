import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';
import type { IndexEntry, VideoMeta } from '@shared/types';
import { slugify, generateId, folderName } from './paths';
import { upsertEntry, removeEntry, readIndex } from './index-store';

interface ImportOpts {
  libraryPath: string;
  sourceAbsPath: string;
  title: string;
  importMode: 'copy' | 'move';
  durationSec: number;
  thumbnailBytes: Buffer;
}

const VIDEO_EXTS = ['.mp4', '.mov', '.mkv', '.webm'];

export async function importVideo(opts: ImportOpts): Promise<VideoMeta> {
  const ext = extname(opts.sourceAbsPath).toLowerCase();
  if (!VIDEO_EXTS.includes(ext)) throw new Error(`Unsupported extension: ${ext}`);

  const id = generateId();
  const slug = slugify(opts.title || basename(opts.sourceAbsPath, ext));
  const now = new Date();
  const folder = folderName(now, slug, id);
  const absFolder = join(opts.libraryPath, folder);
  await fs.mkdir(absFolder, { recursive: true });

  const destVideo = join(absFolder, `source${ext}`);
  if (opts.importMode === 'move') {
    await fs.rename(opts.sourceAbsPath, destVideo).catch(async err => {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await fs.copyFile(opts.sourceAbsPath, destVideo);
        await fs.unlink(opts.sourceAbsPath);
      } else throw err;
    });
  } else {
    await fs.copyFile(opts.sourceAbsPath, destVideo);
  }

  await fs.writeFile(join(absFolder, 'thumbnail.jpg'), opts.thumbnailBytes);

  const meta: VideoMeta = {
    id, title: opts.title, slug, folderName: folder,
    originalFilename: basename(opts.sourceAbsPath),
    sourceRelPath: `${folder}/source${ext}`,
    thumbnailRelPath: `${folder}/thumbnail.jpg`,
    durationSec: opts.durationSec,
    createdAt: now.toISOString(),
    status: 'imported'
  };
  await fs.writeFile(join(absFolder, 'meta.json'), JSON.stringify(meta, null, 2));
  await upsertEntry(opts.libraryPath, metaToEntry(meta));
  return meta;
}

function metaToEntry(m: VideoMeta): IndexEntry {
  return {
    id: m.id, title: m.title, folderName: m.folderName,
    thumbnailRelPath: m.thumbnailRelPath, durationSec: m.durationSec,
    createdAt: m.createdAt, status: m.status
  };
}

async function findFolder(lib: string, id: string): Promise<string> {
  const entries = await readIndex(lib);
  const e = entries.find(e => e.id === id);
  if (!e) throw new Error(`Video not found: ${id}`);
  return join(lib, e.folderName);
}

export async function readMeta(lib: string, id: string): Promise<VideoMeta> {
  const folder = await findFolder(lib, id);
  return JSON.parse(await fs.readFile(join(folder, 'meta.json'), 'utf8'));
}

export async function updateMeta(lib: string, id: string, patch: Partial<VideoMeta>): Promise<VideoMeta> {
  const folder = await findFolder(lib, id);
  const cur = JSON.parse(await fs.readFile(join(folder, 'meta.json'), 'utf8')) as VideoMeta;
  const next: VideoMeta = { ...cur, ...patch };
  await fs.writeFile(join(folder, 'meta.json'), JSON.stringify(next, null, 2));
  await upsertEntry(lib, metaToEntry(next));
  return next;
}

export async function listLibrary(lib: string): Promise<IndexEntry[]> {
  return readIndex(lib);
}

export async function deleteVideo(lib: string, id: string): Promise<void> {
  const folder = await findFolder(lib, id);
  await fs.rm(folder, { recursive: true, force: true });
  await removeEntry(lib, id);
}
