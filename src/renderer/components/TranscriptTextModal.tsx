import { useEffect, useMemo, useState } from 'react';
import { X, Copy, Download } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from './Toast';
import { fmtTimestamp } from '@renderer/lib/transcriptFormat';
import type { TranscriptSegment } from '@shared/types';

interface Props {
  segments: TranscriptSegment[];
  title: string;
  onClose: () => void;
}

/** Strip filesystem-unsafe characters so the exported filename is portable. */
function sanitizeFilename(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ').slice(0, 120);
  return base || 'transcript';
}

export function TranscriptTextModal({ segments, title, onClose }: Props) {
  const [withTimestamps, setWithTimestamps] = useState(false);

  const text = useMemo(
    () =>
      withTimestamps
        ? segments.map(s => `[${fmtTimestamp(s.start)}] ${s.text}`).join('\n')
        : segments.map(s => s.text).join('\n'),
    [segments, withTimestamps]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Transcript copied');
    } catch (e) {
      toast.error(`Copy failed: ${(e as Error).message}`);
    }
  };

  const exportTxt = async () => {
    try {
      const name = `${sanitizeFilename(title)}${withTimestamps ? '-timestamps' : ''}.txt`;
      const res = await window.api.system.saveTextFile(name, text);
      if (res.saved) toast.success('Transcript exported');
    } catch (e) {
      toast.error(`Export failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-lg font-semibold">Full transcript</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X size={18} /></button>
        </div>

        <div className="flex items-center justify-between gap-2 mb-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={withTimestamps} onChange={e => setWithTimestamps(e.target.checked)} />
            Include timestamps
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyAll} className="gap-1.5"><Copy size={14} /> Copy</Button>
            <Button variant="outline" onClick={exportTxt} className="gap-1.5"><Download size={14} /> Export .txt</Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto border rounded p-3 text-sm whitespace-pre-wrap select-text bg-slate-50 leading-relaxed">
          {text || <span className="text-slate-400 italic">Empty transcript.</span>}
        </div>
        <p className="text-xs text-slate-400 mt-2">Tip: select any part of the text above to copy just that portion.</p>
      </div>
    </div>
  );
}
