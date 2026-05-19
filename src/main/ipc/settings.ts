// src/main/ipc/settings.ts
import { ipcMain } from 'electron';
import type { AppSettings } from '@shared/types';
import { loadSettings, saveSettings, setGeminiKey, clearGeminiKey, checkGeminiKey } from '@main/settings';

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:save', (_e, patch: Partial<AppSettings>) => saveSettings(patch));
  ipcMain.handle('settings:setGeminiKey', (_e, key: string) => setGeminiKey(key));
  ipcMain.handle('settings:clearGeminiKey', () => clearGeminiKey());
  // Lazy keychain probe — called by Settings UI on demand to avoid the macOS
  // auth prompt at app startup for users who don't use Gemini.
  ipcMain.handle('settings:checkGeminiKey', () => checkGeminiKey());
}
