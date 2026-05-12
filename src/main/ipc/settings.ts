// src/main/ipc/settings.ts
import { ipcMain } from 'electron';
import type { AppSettings } from '@shared/types';
import { loadSettings, saveSettings, setGeminiKey, clearGeminiKey } from '@main/settings';

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:save', (_e, patch: Partial<AppSettings>) => saveSettings(patch));
  ipcMain.handle('settings:setGeminiKey', (_e, key: string) => setGeminiKey(key));
  ipcMain.handle('settings:clearGeminiKey', () => clearGeminiKey());
}
