import { create } from 'zustand';
import { useEffect } from 'react';
import { X } from 'lucide-react';

type ToastKind = 'info' | 'success' | 'error' | 'warning';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  durationMs: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (kind: ToastKind, message: string, durationMs?: number) => void;
  dismiss: (id: number) => void;
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (kind, message, durationMs = 6000) => {
    const id = Date.now() + Math.random();
    set(s => ({ toasts: [...s.toasts, { id, kind, message, durationMs }] }));
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
}));

export const toast = {
  info: (msg: string) => useToastStore.getState().push('info', msg),
  success: (msg: string) => useToastStore.getState().push('success', msg),
  error: (msg: string) => useToastStore.getState().push('error', msg, 10_000),
  warning: (msg: string) => useToastStore.getState().push('warning', msg)
};

const styles: Record<ToastKind, string> = {
  info: 'bg-slate-900 text-white',
  success: 'bg-green-600 text-white',
  warning: 'bg-amber-500 text-white',
  error: 'bg-red-600 text-white'
};

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToastStore(s => s.dismiss);
  useEffect(() => {
    const h = setTimeout(() => dismiss(t.id), t.durationMs);
    return () => clearTimeout(h);
  }, [t.id, t.durationMs, dismiss]);
  return (
    <div className={`${styles[t.kind]} rounded-md shadow-lg px-4 py-3 text-sm flex items-start gap-3 max-w-md`}>
      <div className="flex-1 whitespace-pre-wrap">{t.message}</div>
      <button onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100"><X size={16} /></button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts);
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.map(t => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}
