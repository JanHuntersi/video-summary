import { ipcMain, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { loadSettings } from '@main/settings';
import { ensureModel } from '@main/transcription/whisper';
import { modelFilePath, SUPPORTED_MODELS, type ModelName } from '@main/transcription/models';

interface ModelInfo {
  id: ModelName;
  installed: boolean;
  sizeBytes: number | null;
}

async function listInstalled(modelsDir: string): Promise<ModelInfo[]> {
  const out: ModelInfo[] = [];
  for (const id of SUPPORTED_MODELS) {
    const path = modelFilePath(modelsDir, id);
    try {
      const stat = await fs.stat(path);
      out.push({ id, installed: true, sizeBytes: stat.size });
    } catch {
      out.push({ id, installed: false, sizeBytes: null });
    }
  }
  return out;
}

export function registerModelsIpc() {
  ipcMain.handle('models:list', async () => {
    const s = await loadSettings();
    return listInstalled(s.whisper.modelsDir);
  });

  ipcMain.handle('models:delete', async (_e, id: ModelName) => {
    const s = await loadSettings();
    const path = modelFilePath(s.whisper.modelsDir, id);
    await fs.unlink(path).catch(() => { /* already gone */ });
  });

  ipcMain.handle('models:download', async (e, id: ModelName) => {
    const s = await loadSettings();
    const send = (downloaded: number, total: number) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('models:downloadProgress', { id, downloaded, total });
      }
    };
    try {
      await ensureModel(s.whisper.modelsDir, id, { onProgress: send });
      e.sender.send('models:downloadDone', { id });
    } catch (err) {
      e.sender.send('models:downloadError', { id, message: (err as Error).message });
      throw err;
    }
  });
}
