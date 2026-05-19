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
    cached = {
      ...def,
      ...parsed,
      whisper: { ...def.whisper, ...parsed.whisper },
      ollama: { ...def.ollama, ...parsed.ollama },
      prompts: { ...def.prompts, ...parsed.prompts },
      defaultLlm: { ...def.defaultLlm, ...(parsed.defaultLlm ?? {}) },
      autoTranscribe: parsed.autoTranscribe ?? def.autoTranscribe,
      autoSummarize: parsed.autoSummarize ?? def.autoSummarize
    };
  } catch {
    cached = def;
  }
  // hasKey is intentionally NOT populated here. Reading the keychain at startup
  // triggers a macOS auth prompt for unsigned builds even when the user never
  // intends to use Gemini. Call checkGeminiKey() lazily (e.g. when the Settings
  // page mounts) instead.
  cached!.gemini.hasKey = false;
  return cached!;
}

/** Probe the keychain for an existing Gemini key. Triggers macOS Keychain auth
 *  prompt on unsigned builds the first time it runs. Call lazily — only when
 *  the user opens UI that needs to know whether a key is configured. */
export async function checkGeminiKey(): Promise<boolean> {
  const existing = await keytar.getPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT);
  if (cached) cached.gemini.hasKey = !!existing;
  return !!existing;
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
