import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '@renderer/stores/library';
import { useSettings } from '@renderer/stores/settings';
import { VideoCard } from '@renderer/components/VideoCard';
import { Button } from '@renderer/components/ui/button';
import type { VideoStatus } from '@shared/types';
import { cn } from '@renderer/lib/cn';

export default function Library() {
  const { videos, refresh } = useLibrary();
  const { load: loadSettings } = useSettings();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<VideoStatus | 'all'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    void loadSettings().then(refresh);
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    videos.forEach(v => (v.tags ?? []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [videos]);

  const filtered = useMemo(() => {
    const needle = q.toLowerCase();
    return videos.filter(v => {
      if (needle && !v.title.toLowerCase().includes(needle)) return false;
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (selectedTags.length && !selectedTags.every(t => (v.tags ?? []).includes(t))) return false;
      return true;
    });
  }, [videos, q, statusFilter, selectedTags]);

  const toggleTag = (t: string) =>
    setSelectedTags(cur => cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Link to="/new"><Button>+ New Video</Button></Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input value={q} onChange={e => setQ(e.target.value)}
               placeholder="Search title…"
               className="border rounded px-3 py-2 text-sm w-72" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as VideoStatus | 'all')}
                className="border rounded px-2 py-2 text-sm">
          <option value="all">All statuses</option>
          {(['imported', 'transcribed', 'summarized', 'error'] as const).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(q || statusFilter !== 'all' || selectedTags.length > 0) && (
          <button onClick={() => { setQ(''); setStatusFilter('all'); setSelectedTags([]); }}
                  className="text-xs text-slate-600 underline">Clear filters</button>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          <span className="text-xs text-slate-500 mr-1 self-center">Tags:</span>
          {allTags.map(t => (
            <button key={t} onClick={() => toggleTag(t)}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded border',
                      selectedTags.includes(t)
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    )}>
              {t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-slate-500 text-sm">
          {videos.length === 0 ? 'No videos yet. Click "New Video" to import one.' : 'No videos match the current filters.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v => <VideoCard key={v.id} entry={v} />)}
        </div>
      )}
    </div>
  );
}
