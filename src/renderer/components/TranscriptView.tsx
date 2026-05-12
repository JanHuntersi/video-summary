import type { TranscriptSegment } from '@shared/types';

function ts(sec: number) {
  const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TranscriptView({ segments, onSeek }: { segments: TranscriptSegment[]; onSeek: (sec: number) => void }) {
  return (
    <div className="overflow-auto h-full">
      {segments.map((s, i) => (
        <button key={i} onClick={() => onSeek(s.start)}
                className="block w-full text-left px-3 py-1.5 hover:bg-slate-100 text-sm">
          <span className="text-slate-500 mr-2 font-mono">{ts(s.start)}</span>{s.text}
        </button>
      ))}
    </div>
  );
}
