import { create } from 'zustand';
import type { IndexEntry } from '@shared/types';

interface State {
  videos: IndexEntry[];
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useLibrary = create<State>((set) => ({
  videos: [],
  refresh: async () => set({ videos: await window.api.library.list() }),
  remove: async (id) => {
    await window.api.library.delete(id);
    set((s) => ({ videos: s.videos.filter((v) => v.id !== id) }));
  }
}));
