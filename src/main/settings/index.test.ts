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
    expect(s.importMode).toBe('copy');
    expect(s.whisper.defaultModel).toBe('small');
    expect(s.gemini.hasKey).toBe(false);
  });

  it('persists and reloads partial updates', async () => {
    const { loadSettings, saveSettings } = await import('./index');
    await saveSettings({ importMode: 'move' });
    const s = await loadSettings();
    expect(s.importMode).toBe('move');
    expect(existsSync(join(dir, 'settings.json'))).toBe(true);
  });
});
