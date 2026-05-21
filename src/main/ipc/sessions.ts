// src/main/ipc/sessions.ts
import { BrowserWindow, ipcMain } from 'electron';
import { SessionManager, type SessionManagerConfig } from '@main/sessions/manager';
import { loadSettings, getGeminiKey } from '@main/settings';

let manager: SessionManager | null = null;

async function buildConfig(): Promise<SessionManagerConfig> {
  const s = await loadSettings();
  const geminiApiKey = (await getGeminiKey()) ?? undefined;
  return {
    libraryPath: s.libraryPath,
    importMode: s.importMode,
    autoTranscribe: s.autoTranscribe,
    autoSummarize: s.autoSummarize,
    modelsDir: s.whisper.modelsDir,
    defaultModel: s.whisper.defaultModel,
    defaultLanguage: 'auto',
    defaultLlm: s.defaultLlm,
    summaryPrompt: s.prompts.summary,
    geminiApiKey,
    // No ollamaBaseUrl in settings — OllamaProvider's default applies.
  };
}

export function getSessionManager(): SessionManager {
  if (!manager) throw new Error('Session manager not initialised — call registerSessionsIpc first');
  return manager;
}

export async function refreshSessionManagerConfig(): Promise<void> {
  if (!manager) return;
  manager.setConfig(await buildConfig());
}

export async function registerSessionsIpc(): Promise<void> {
  const cfg = await buildConfig();
  manager = new SessionManager(cfg);

  manager.onChange(() => {
    const items = manager!.getAll();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('sessions:changed', { items });
    }
  });

  ipcMain.handle('sessions:list', () => manager!.getAll());
  ipcMain.handle('sessions:get', (_e, id: string) => manager!.get(id));
  ipcMain.handle('sessions:startLocal', (_e, args: { sourcePath: string; title: string }) =>
    manager!.startLocal(args).then(id => ({ id }))
  );
  ipcMain.handle('sessions:startUrl', (_e, args: { url: string; title?: string }) =>
    manager!.startUrl(args).then(id => ({ id }))
  );
  ipcMain.handle('sessions:cancel', (_e, id: string) => manager!.cancel(id));
  ipcMain.handle('sessions:dismiss', (_e, id: string) => manager!.dismiss(id));
  ipcMain.handle('sessions:startTranscribe', (_e, args: { videoId: string; model?: string; language?: string }) =>
    manager!.startTranscribe(args.videoId, { model: args.model as any, language: args.language }).then(id => ({ id }))
  );
}
