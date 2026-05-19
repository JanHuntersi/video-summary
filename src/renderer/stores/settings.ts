import { create } from 'zustand';
import type { AppSettings } from '@shared/types';

interface State {
  settings: AppSettings | null;
  load: () => Promise<void>;
  save: (patch: Partial<AppSettings>) => Promise<void>;
  /** Probe the keychain for a Gemini key. Triggers a macOS auth prompt on
   *  unsigned builds — call only from UI that needs to know hasKey. */
  checkGeminiKey: () => Promise<void>;
}

export const useSettings = create<State>((set, get) => ({
  settings: null,
  load: async () => set({ settings: await window.api.settings.get() }),
  save: async (patch) => {
    const next = await window.api.settings.save(patch);
    set({ settings: next });
  },
  checkGeminiKey: async () => {
    const hasKey = await window.api.settings.checkGeminiKey();
    const s = get().settings;
    if (s) set({ settings: { ...s, gemini: { ...s.gemini, hasKey } } });
  }
}));
