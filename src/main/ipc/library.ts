// src/main/ipc/library.ts
import { ipcMain, dialog } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { loadSettings } from '@main/settings';
import { reconcileLibrary } from '@main/library/reconcile';
import { listLibrary, readMeta, updateMeta, deleteVideo, importVideo } from '@main/library/crud';
import { extractDuration, extractThumbnail } from '@main/media/ffmpeg';
import type { ChatHistory, TranscriptSegment, VideoMeta } from '@shared/types';

export function registerLibraryIpc() {
  ipcMain.handle('library:reconcile', async () => {
    const s = await loadSettings();
    await reconcileLibrary(s.libraryPath);
  });

  ipcMain.handle('library:list', async () => {
    const s = await loadSettings();
    return listLibrary(s.libraryPath);
  });

  ipcMain.handle('library:getMeta', async (_e, id: string) => {
    const s = await loadSettings();
    return readMeta(s.libraryPath, id);
  });

  ipcMain.handle('library:updateMeta', async (_e, id: string, patch: Partial<VideoMeta>) => {
    const s = await loadSettings();
    return updateMeta(s.libraryPath, id, patch);
  });

  ipcMain.handle('library:delete', async (_e, id: string) => {
    const s = await loadSettings();
    await deleteVideo(s.libraryPath, id);
  });

  ipcMain.handle('library:pickFile', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }]
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('library:pickFolder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle(
    'library:import',
    async (_e, { sourceAbsPath, title }: { sourceAbsPath: string; title: string }) => {
      const s = await loadSettings();
      const duration = await extractDuration(sourceAbsPath);
      const thumb = await extractThumbnail(sourceAbsPath, duration);
      return importVideo({
        libraryPath: s.libraryPath,
        sourceAbsPath,
        title,
        importMode: s.importMode,
        durationSec: duration,
        thumbnailBytes: thumb
      });
    }
  );

  ipcMain.handle('library:readTranscript', async (_e, id: string): Promise<TranscriptSegment[] | null> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    try {
      return JSON.parse(
        await fs.readFile(join(s.libraryPath, meta.folderName, 'transcript.json'), 'utf8')
      );
    } catch {
      return null;
    }
  });

  ipcMain.handle('library:readSummary', async (_e, id: string): Promise<string | null> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    try {
      return await fs.readFile(join(s.libraryPath, meta.folderName, 'summary.md'), 'utf8');
    } catch {
      return null;
    }
  });

  ipcMain.handle('library:writeSummary', async (_e, id: string, markdown: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    await fs.writeFile(join(s.libraryPath, meta.folderName, 'summary.md'), markdown);
  });

  ipcMain.handle('library:readChat', async (_e, id: string): Promise<ChatHistory | null> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    try {
      return JSON.parse(
        await fs.readFile(join(s.libraryPath, meta.folderName, 'chat.json'), 'utf8')
      );
    } catch {
      return null;
    }
  });

  ipcMain.handle('library:writeChat', async (_e, id: string, history: ChatHistory) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    await fs.writeFile(
      join(s.libraryPath, meta.folderName, 'chat.json'),
      JSON.stringify(history, null, 2)
    );
  });

  ipcMain.handle('library:videoFileUrl', async (_e, id: string): Promise<string> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    return `file://${join(s.libraryPath, meta.sourceRelPath)}`;
  });
}
