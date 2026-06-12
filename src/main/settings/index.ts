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
      // hasKey is a non-secret flag persisted on save; the actual key lives in the
      // keychain. Reading it from disk lets every provider picker know Gemini is
      // configured WITHOUT triggering a macOS keychain auth prompt on load.
      gemini: { hasKey: parsed.gemini?.hasKey ?? false },
      autoTranscribe: parsed.autoTranscribe ?? def.autoTranscribe,
      autoSummarize: parsed.autoSummarize ?? def.autoSummarize,
      // Migrate the legacy `importMode: 'copy' | 'move'` setting: a saved 'move'
      // meant "delete originals", so preserve that choice. New installs default false.
      deleteOriginals: parsed.deleteOriginals ?? (parsed.importMode === 'move')
    };
  } catch {
    cached = def;
  }
  return cached!;
}

/** Probe the keychain for an existing Gemini key. Triggers macOS Keychain auth
 *  prompt on unsigned builds the first time it runs. Call lazily — only when
 *  the user opens UI that needs to know whether a key is configured. */
export async function checkGeminiKey(): Promise<boolean> {
  const has = !!(await keytar.getPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT));
  const current = await loadSettings();
  // Reconcile the persisted flag with the real keychain state (e.g. a key set in an
  // older build that never wrote the flag, or one removed outside the app).
  if (current.gemini.hasKey !== has) await saveSettings({ gemini: { hasKey: has } });
  return has;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = { ...current, ...patch };
  await fs.mkdir(join(app.getPath('userData')), { recursive: true });
  // Persist only the non-secret hasKey flag; the API key itself stays in the keychain.
  await fs.writeFile(settingsPath(), JSON.stringify({ ...next, gemini: { hasKey: next.gemini.hasKey } }, null, 2));
  cached = next;
  return next;
}

export async function setGeminiKey(key: string): Promise<void> {
  await keytar.setPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT, key);
  // Persist the flag so every provider picker shows Gemini without re-probing the keychain.
  await saveSettings({ gemini: { hasKey: true } });
}

export async function getGeminiKey(): Promise<string | null> {
  return keytar.getPassword(KEYTAR_SERVICE, GEMINI_ACCOUNT);
}

export async function clearGeminiKey(): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, GEMINI_ACCOUNT);
  await saveSettings({ gemini: { hasKey: false } });
}
