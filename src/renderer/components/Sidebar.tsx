import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { cn } from '@renderer/lib/cn';
import { Library as LibIcon, Settings as SetIcon, Plus, Loader2, X } from 'lucide-react';
import type { SessionItem, SessionStage } from '@shared/types';

const item = 'flex items-center gap-2 px-3 py-2 rounded-md text-sm';
const TERMINAL: SessionStage[] = ['summarized', 'transcribed', 'cancelled', 'error'];

function stageBadgeClass(stage: SessionStage): string {
  if (stage === 'error') return 'bg-red-100 text-red-800';
  if (stage === 'cancelled') return 'bg-slate-200 text-slate-700';
  if (stage === 'importing-local' || stage === 'importing-url') return 'bg-amber-100 text-amber-800';
  if (stage === 'transcribing') return 'bg-blue-100 text-blue-800';
  if (stage === 'summarizing') return 'bg-purple-100 text-purple-800';
  return 'bg-green-100 text-green-800';
}

export function Sidebar() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    void window.api.sessions.list().then(setSessions).catch(() => {});
    void window.api.system.getVersion().then(setVersion).catch(() => {});
    const off = window.api.sessions.onChange(items => setSessions(items));
    return () => { off(); };
  }, []);

  const onActionClick = async (e: React.MouseEvent, s: SessionItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (TERMINAL.includes(s.stage)) {
      await window.api.sessions.dismiss(s.id);
    } else {
      if (!confirm(`Cancel "${s.title}"?`)) return;
      await window.api.sessions.cancel(s.id);
    }
  };

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

      {sessions.length > 0 && (
        <div className="border-t border-slate-200 pt-2 mb-1 -mx-3 px-3 bg-slate-50">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5">
            <Loader2 size={12} className="animate-spin" /> Sessions
          </div>
          <ul className="space-y-1">
            {sessions.map(s => (
              <li key={s.id}>
                <NavLink
                  to={`/sessions/${s.id}`}
                  className={({ isActive }) =>
                    cn('flex items-center gap-1.5 text-[11px] px-1 py-0.5 rounded',
                       isActive ? 'bg-slate-200' : 'hover:bg-slate-100')
                  }>
                  <span className="truncate flex-1 text-slate-700" title={s.title}>{s.title}</span>
                  <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-[10px]', stageBadgeClass(s.stage))}>
                    {s.stage}
                  </span>
                  <button
                    onClick={e => onActionClick(e, s)}
                    className="shrink-0 text-slate-400 hover:text-slate-700"
                    title={TERMINAL.includes(s.stage) ? 'Remove' : 'Cancel'}>
                    <X size={11} />
                  </button>
                </NavLink>
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

      {version && (
        <div
          className="text-[10px] text-slate-400 text-center pt-2 select-text"
          title="Click to view release notes on GitHub"
        >
          <button
            onClick={() => window.api.system.openExternal(`https://github.com/JanHuntersi/video-summary/releases/tag/v${version}`)}
            className="hover:text-slate-600 hover:underline"
          >
            VideoSummary v{version}
          </button>
        </div>
      )}
    </aside>
  );
}
