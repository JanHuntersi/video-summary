import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { IndexEntry } from '@shared/types';
import { useSettings } from '@renderer/stores/settings';

function statusColor(s: IndexEntry['status']) {
  return {
    imported: 'bg-slate-200',
    transcribing: 'bg-amber-200',
    transcribed: 'bg-blue-200',
    summarizing: 'bg-amber-300',
    summarized: 'bg-green-200',
    error: 'bg-red-200'
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
    if (settings) setThumb(`file://${settings.libraryPath}/${entry.thumbnailRelPath}`);
  }, [settings, entry]);

  return (
    <Link
      to={`/video/${entry.id}`}
      className="block border rounded-lg overflow-hidden hover:shadow-md transition-shadow bg-white"
    >
      <div className="aspect-video bg-slate-100">
        {thumb && <img src={thumb} className="w-full h-full object-cover" />}
      </div>
      <div className="p-3">
        <div className="font-medium truncate">{entry.title}</div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-slate-500">{formatDuration(entry.durationSec)}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${statusColor(entry.status)}`}>
            {entry.status}
          </span>
        </div>
      </div>
    </Link>
  );
}
