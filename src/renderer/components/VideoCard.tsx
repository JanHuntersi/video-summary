import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { IndexEntry } from '@shared/types';
import { useSettings } from '@renderer/stores/settings';

function statusColor(s: IndexEntry['status']) {
  return {
    imported: 'bg-slate-200 text-slate-700',
    transcribing: 'bg-amber-200 text-amber-800',
    transcribed: 'bg-blue-200 text-blue-800',
    summarizing: 'bg-amber-300 text-amber-900',
    summarized: 'bg-green-200 text-green-800',
    error: 'bg-red-200 text-red-800'
  }[s];
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoCard({ entry }: { entry: IndexEntry }) {
  const { settings } = useSettings();
  const [thumb, setThumb] = useState<string>('');
  useEffect(() => {
    if (settings) setThumb(`vswfile://local${encodeURI(`${settings.libraryPath}/${entry.thumbnailRelPath}`)}`);
  }, [settings, entry]);

  const tags = entry.tags ?? [];

  return (
    <Link
      to={`/video/${entry.id}`}
      className="block border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white"
    >
      <div className="aspect-video bg-slate-100 relative">
        {thumb && <img src={thumb} className="w-full h-full object-cover" />}
        <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
          {formatDuration(entry.durationSec)}
        </span>
      </div>
      <div className="p-3">
        <div className="font-medium truncate" title={entry.title}>{entry.title}</div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-500">
            {new Date(entry.createdAt).toLocaleDateString()}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${statusColor(entry.status)}`}>
            {entry.status}
          </span>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.slice(0, 5).map(t => (
              <span key={t} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{t}</span>
            ))}
            {tags.length > 5 && <span className="text-[10px] text-slate-500">+{tags.length - 5}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
