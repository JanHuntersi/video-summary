// src/main/ipc/settings.ts
import { ipcMain } from 'electron';
import type { AppSettings } from '@shared/types';
import { loadSettings, saveSettings, setGeminiKey, clearGeminiKey, checkGeminiKey } from '@main/settings';
import { refreshSessionManagerConfig } from './sessions';

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:save', async (_e, patch: Partial<AppSettings>) => {
    const result = await saveSettings(patch);
    await refreshSessionManagerConfig();
    return result;
  });
  ipcMain.handle('settings:setGeminiKey', async (_e, key: string) => {
    const result = await setGeminiKey(key);
    await refreshSessionManagerConfig();
    return result;
  });
  ipcMain.handle('settings:clearGeminiKey', async () => {
    const result = await clearGeminiKey();
    await refreshSessionManagerConfig();
    return result;
  });
  // Lazy keychain probe — called by Settings UI on demand to avoid the macOS
  // auth prompt at app startup for users who don't use Gemini.
  ipcMain.handle('settings:checkGeminiKey', () => checkGeminiKey());
}
