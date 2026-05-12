import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { cn } from '@renderer/lib/cn';
import { Library as LibIcon, Settings as SetIcon, Plus, Loader2 } from 'lucide-react';

const item = 'flex items-center gap-2 px-3 py-2 rounded-md text-sm';

type QueueItem = { videoId: string; title: string; status: 'queued' | 'running'; addedAt: string };

export function Sidebar() {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    void window.api.transcription.getQueue().then(setQueue).catch(() => {});
    const off = window.api.transcription.onQueueChanged(items => setQueue(items));
    return () => { off(); };
  }, []);

  return (
    <aside className="w-56 shrink-0 border-r border-slate-200 p-3 flex flex-col gap-1 bg-slate-50">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          cn(item, isActive ? 'bg-slate-200' : 'hover:bg-slate-100')
        }
      >
        <LibIcon size={16} /> Library
      </NavLink>
      <NavLink
        to="/new"
        className={({ isActive }) =>
          cn(item, isActive ? 'bg-slate-200' : 'hover:bg-slate-100')
        }
      >
        <Plus size={16} /> New Video
      </NavLink>
      <div className="flex-1" />

      {queue.length > 0 && (
        <div className="border-t border-slate-200 pt-2 mb-1 -mx-3 px-3 bg-slate-50">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
            <Loader2 size={12} className="animate-spin" />
            Processing
          </div>
          <ul className="space-y-1">
            {queue.map(q => (
              <li key={q.videoId} className="flex items-center gap-1.5 text-[11px]">
                <span className="truncate flex-1 text-slate-700" title={q.title}>{q.title}</span>
                <span className={cn(
                  'shrink-0 px-1.5 py-0.5 rounded text-[10px]',
                  q.status === 'queued' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                )}>
                  {q.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          cn(item, isActive ? 'bg-slate-200' : 'hover:bg-slate-100')
        }
      >
        <SetIcon size={16} /> Settings
      </NavLink>
    </aside>
  );
}
