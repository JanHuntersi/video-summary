import { NavLink } from 'react-router-dom';
import { cn } from '@renderer/lib/cn';
import { Library as LibIcon, Settings as SetIcon, Plus } from 'lucide-react';

const item = 'flex items-center gap-2 px-3 py-2 rounded-md text-sm';

export function Sidebar() {
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
