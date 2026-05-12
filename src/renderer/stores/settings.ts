import { create } from 'zustand';
import type { AppSettings } from '@shared/types';

interface State {
  settings: AppSettings | null;
  load: () => Promise<void>;
  save: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useSettings = create<State>((set) => ({
  settings: null,
  load: async () => set({ settings: await window.api.settings.get() }),
  save: async (patch) => {
    const next = await window.api.settings.save(patch);
    set({ settings: next });
  }
}));
