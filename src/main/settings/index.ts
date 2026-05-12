// src/main/settings/index.ts
import { promises as fs } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import keytar from 'keytar';
import type { AppSettings } from '@shared/types';
import { defaultSettings } from './defaults';

const KEYTAR_SERVICE = 'VideoSummaryWorkflow';
const GEMINI_ACCOUNT = 'gemini-api-key';

function settingsPath() {
  return join(app.getPath('userData'), 'settings.json');
}

let cached: AppSettings | null = null;

export async function loadSettings(): Promise<AppSettings> {
  if (cached) return cached;
  const def = defaultSettings();
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    cached = { ...def, ...parsed, whisper: { ...def.whisper, ...parsed.whisper }, ollama: { ...def.ollama, ...parsed.ollama }, prompts: { ...def.prompts, ...parsed.prompts } };
  } catch {
    cached = def;
  }
  const existing = await keytar.getPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT);
  cached!.gemini.hasKey = !!existing;
  return cached!;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = { ...current, ...patch };
  await fs.mkdir(join(app.getPath('userData')), { recursive: true });
  // Never write the gemini.hasKey flag derived from keychain; recompute on load.
  const { gemini, ...rest } = next;
  await fs.writeFile(settingsPath(), JSON.stringify({ ...rest, gemini: { /* nothing persisted */ } }, null, 2));
  cached = next;
  return next;
}

export async function setGeminiKey(key: string): Promise<void> {
  await keytar.setPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT, key);
  if (cached) cached.gemini.hasKey = true;
}

export async function getGeminiKey(): Promise<string | null> {
  return keytar.getPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT);
}

export async function clearGeminiKey(): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, GEMINI_ACCOUNT);
  if (cached) cached.gemini.hasKey = false;
}
