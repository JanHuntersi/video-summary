// src/main/settings/index.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('electron', () => ({ app: { getPath: (_: string) => process.env.TEST_USER_DATA! } }));
vi.mock('keytar', () => ({
  default: {
    setPassword: vi.fn(async () => {}),
    getPassword: vi.fn(async () => null),
    deletePassword: vi.fn(async () => true)
  },
  setPassword: vi.fn(async () => {}),
  getPassword: vi.fn(async () => null),
  deletePassword: vi.fn(async () => true)
}));

describe('settings', () => {
  let dir: string;
  beforeEach(() => {
    vi.resetModules();
    dir = mkdtempSync(join(tmpdir(), 'vsw-'));
    process.env.TEST_USER_DATA = dir;
  });

  it('returns defaults on first load', async () => {
    const { loadSettings } = await import('./index');
    const s = await loadSettings();
    expect(s.deleteOriginals).toBe(false);
    expect(s.whisper.defaultModel).toBe('small');
    expect(s.gemini.hasKey).toBe(false);
  });

  it('persists and reloads partial updates', async () => {
    const { loadSettings, saveSettings } = await import('./index');
    await saveSettings({ deleteOriginals: true });
    const s = await loadSettings();
    expect(s.deleteOriginals).toBe(true);
    expect(existsSync(join(dir, 'settings.json'))).toBe(true);
  });

  it('migrates legacy importMode="move" to deleteOriginals=true', async () => {
    const { writeFileSync } = await import('fs');
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ importMode: 'move' }));
    const { loadSettings } = await import('./index');
    const s = await loadSettings();
    expect(s.deleteOriginals).toBe(true);
  });

  it('persists gemini.hasKey so provider pickers see it without re-probing the keychain', async () => {
    const { loadSettings, saveSettings } = await import('./index');
    await saveSettings({ gemini: { hasKey: true } });
    const s = await loadSettings();
    expect(s.gemini.hasKey).toBe(true);
    // And it survives unrelated saves.
    await saveSettings({ deleteOriginals: true });
    expect((await loadSettings()).gemini.hasKey).toBe(true);
  });
});
