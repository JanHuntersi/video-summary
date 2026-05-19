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

  ipcMain.handle('library:readNotes', async (_e, id: string): Promise<string> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    try {
      return await fs.readFile(join(s.libraryPath, meta.folderName, 'notes.md'), 'utf8');
    } catch {
      return '';
    }
  });

  ipcMain.handle('library:writeNotes', async (_e, id: string, markdown: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    await fs.writeFile(join(s.libraryPath, meta.folderName, 'notes.md'), markdown);
  });

  ipcMain.handle('library:appendNotes', async (_e, id: string, fragment: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    const path = join(s.libraryPath, meta.folderName, 'notes.md');
    let current = '';
    try { current = await fs.readFile(path, 'utf8'); } catch { /* new file */ }
    const sep = current.length === 0 ? '' : (current.endsWith('\n') ? '\n' : '\n\n');
    await fs.writeFile(path, current + sep + fragment + (fragment.endsWith('\n') ? '' : '\n'));
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

  // --- Multi-chat sessions per video ---
  ipcMain.handle('library:listChats', async (_e, videoId: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, videoId);
    const chatsDir = join(s.libraryPath, meta.folderName, 'chats');
    await fs.mkdir(chatsDir, { recursive: true });

    // Migrate legacy single chat.json once.
    const legacy = join(s.libraryPath, meta.folderName, 'chat.json');
    try {
      const raw = await fs.readFile(legacy, 'utf8');
      const old = JSON.parse(raw) as ChatHistory;
      if (old.messages && old.messages.length > 0) {
        const migratedId = `chat-${Date.now().toString(36)}`;
        const record = {
          id: migratedId,
          title: 'Imported chat',
          createdAt: new Date().toISOString(),
          lastMessageAt: old.messages[old.messages.length - 1].createdAt ?? new Date().toISOString(),
          messages: old.messages,
          systemPromptUsed: old.systemPromptUsed
        };
        await fs.writeFile(join(chatsDir, `${migratedId}.json`), JSON.stringify(record, null, 2));
      }
      await fs.unlink(legacy).catch(() => {});
    } catch { /* no legacy file */ }

    const files = (await fs.readdir(chatsDir).catch(() => [])).filter(f => f.endsWith('.json'));
    const summaries = await Promise.all(files.map(async f => {
      const data = JSON.parse(await fs.readFile(join(chatsDir, f), 'utf8'));
      return {
        id: data.id, title: data.title, createdAt: data.createdAt,
        lastMessageAt: data.lastMessageAt, messageCount: (data.messages ?? []).length
      };
    }));
    return summaries.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  });

  ipcMain.handle('library:readChatById', async (_e, videoId: string, chatId: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, videoId);
    try {
      return JSON.parse(await fs.readFile(join(s.libraryPath, meta.folderName, 'chats', `${chatId}.json`), 'utf8'));
    } catch { return null; }
  });

  ipcMain.handle('library:writeChatById', async (_e, videoId: string, record: { id: string; title: string; createdAt: string; lastMessageAt: string; messages: ChatHistory['messages']; systemPromptUsed: string }) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, videoId);
    const dir = join(s.libraryPath, meta.folderName, 'chats');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, `${record.id}.json`), JSON.stringify(record, null, 2));
  });

  ipcMain.handle('library:createChat', async (_e, videoId: string, title?: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, videoId);
    const dir = join(s.libraryPath, meta.folderName, 'chats');
    await fs.mkdir(dir, { recursive: true });
    const id = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const record = {
      id,
      title: title?.trim() || 'New chat',
      createdAt: now,
      lastMessageAt: now,
      messages: [],
      systemPromptUsed: ''
    };
    await fs.writeFile(join(dir, `${id}.json`), JSON.stringify(record, null, 2));
    return record;
  });

  ipcMain.handle('library:deleteChat', async (_e, videoId: string, chatId: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, videoId);
    await fs.unlink(join(s.libraryPath, meta.folderName, 'chats', `${chatId}.json`)).catch(() => {});
  });

  ipcMain.handle('library:renameChat', async (_e, videoId: string, chatId: string, title: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, videoId);
    const path = join(s.libraryPath, meta.folderName, 'chats', `${chatId}.json`);
    const data = JSON.parse(await fs.readFile(path, 'utf8'));
    data.title = title.trim() || data.title;
    await fs.writeFile(path, JSON.stringify(data, null, 2));
    return data;
  });

  ipcMain.handle('library:videoFileUrl', async (_e, id: string): Promise<string> => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    return `vswfile://local${encodeURI(join(s.libraryPath, meta.sourceRelPath))}`;
  });

  ipcMain.handle('library:getPaths', async (_e, id: string) => {
    const s = await loadSettings();
    const meta = await readMeta(s.libraryPath, id);
    const absSource = join(s.libraryPath, meta.sourceRelPath);
    const absThumb = join(s.libraryPath, meta.thumbnailRelPath);
    const absFolder = join(s.libraryPath, meta.folderName);
    return {
      videoUrl: `vswfile://local${encodeURI(absSource)}`,
      thumbnailUrl: `vswfile://local${encodeURI(absThumb)}`,
      absSourcePath: absSource,
      absFolder
    };
  });

  ipcMain.handle('library:searchAll', async (_e, query: string) => {
    const q = (query ?? '').trim();
    if (q.length === 0) return [];
    const needle = q.toLowerCase();
    const s = await loadSettings();
    const entries = await listLibrary(s.libraryPath);

    const results: Array<{
      videoId: string;
      title: string;
      matches: Array<{ segmentStart: number; snippet: string }>;
    }> = [];

    for (const entry of entries) {
      if (results.length >= 100) break;
      const matches: Array<{ segmentStart: number; snippet: string }> = [];

      if (entry.title.toLowerCase().includes(needle)) {
        matches.push({ segmentStart: 0, snippet: '(title match)' });
      }
      for (const tag of entry.tags ?? []) {
        if (tag.toLowerCase().includes(needle)) {
          matches.push({ segmentStart: 0, snippet: `(tag: ${tag})` });
        }
      }

      try {
        const raw = await fs.readFile(
          join(s.libraryPath, entry.folderName, 'transcript.json'),
          'utf8'
        );
        const segments = JSON.parse(raw) as TranscriptSegment[];
        for (const seg of segments) {
          if (matches.length >= 5) break;
          if ((seg.text ?? '').toLowerCase().includes(needle)) {
            const text = seg.text ?? '';
            const snippet = text.length > 200 ? text.slice(0, 200) + '…' : text;
            matches.push({ segmentStart: seg.start, snippet });
          }
        }
      } catch {
        // no transcript or unreadable — skip
      }

      if (matches.length > 0) {
        results.push({
          videoId: entry.id,
          title: entry.title,
          matches: matches.slice(0, 5)
        });
      }
    }

    return results;
  });

  ipcMain.handle('library:revealInFinder', async (_e, absPath: string) => {
    const { shell } = await import('electron');
    shell.showItemInFolder(absPath);
  });
}
