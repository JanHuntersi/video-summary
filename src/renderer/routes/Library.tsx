import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLibrary } from '@renderer/stores/library';
import { useSettings } from '@renderer/stores/settings';
import { VideoCard } from '@renderer/components/VideoCard';
import { Button } from '@renderer/components/ui/button';
import { toast } from '@renderer/components/Toast';
import type { VideoStatus } from '@shared/types';
import { cn } from '@renderer/lib/cn';

type SearchMatch = { segmentStart: number; snippet: string };
type SearchResult = { videoId: string; title: string; matches: SearchMatch[] };

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Library() {
  const { videos, refresh } = useLibrary();
  const { settings, load: loadSettings } = useSettings();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<VideoStatus | 'all'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [dropImporting, setDropImporting] = useState(false);

  // Global shortcuts: Cmd/Ctrl+K focus search, Cmd/Ctrl+N new video
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); searchInputRef.current?.focus(); }
      else if (e.key.toLowerCase() === 'n') { e.preventDefault(); navigate('/new'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const videoFiles = files
      .filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f.name))
      .map(f => (f as File & { path?: string }).path)
      .filter((p): p is string => !!p);
    if (videoFiles.length === 0) {
      toast.error('Drop a .mp4, .mov, .mkv, or .webm file');
      return;
    }
    setDropImporting(true);
    try {
      for (const absPath of videoFiles) {
        const title = absPath.split('/').pop()!.replace(/\.[^.]+$/, '');
        try {
          await window.api.sessions.startLocal(absPath, title);
          toast.success(`Importing: ${title}`);
        } catch (err) {
          toast.error(`Import failed for ${title}: ${(err as Error).message}`);
        }
      }
      await refresh();
    } finally {
      setDropImporting(false);
    }
  };

  useEffect(() => {
    void loadSettings().then(refresh);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setGlobalResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await window.api.library.searchAll(q.trim());
        setGlobalResults(r);
      } catch {
        setGlobalResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

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

  const videosById = useMemo(() => {
    const m = new Map<string, typeof videos[number]>();
    videos.forEach(v => m.set(v.id, v));
    return m;
  }, [videos]);

  return (
    <div
      className={cn('p-6 relative min-h-full', dragOver && 'bg-slate-100')}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={e => {
        // Only unset if leaving the container entirely
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-slate-900/30">
          <div className="bg-white border-4 border-dashed border-slate-900 rounded-xl px-8 py-6 text-lg font-semibold">
            Drop video files to import
          </div>
        </div>
      )}
      {dropImporting && (
        <div className="fixed top-4 right-4 z-40 bg-slate-900 text-white text-sm px-3 py-2 rounded shadow">
          Importing dropped files…
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Link to="/new"><Button>+ New Video</Button></Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <input ref={searchInputRef} value={q} onChange={e => setQ(e.target.value)}
               placeholder="Search title or transcripts… (⌘K)"
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

      {globalResults.length > 0 && (
        <section className="mb-6 border rounded-lg bg-white">
          <div className="px-4 py-2 border-b text-sm font-medium text-slate-700 flex items-center justify-between">
            <span>Transcript matches</span>
            {isSearching && <span className="text-xs text-slate-500">searching…</span>}
          </div>
          <ul className="divide-y">
            {globalResults.map(r => {
              const entry = videosById.get(r.videoId);
              const thumb = entry && settings
                ? `vswfile://local${encodeURI(`${settings.libraryPath}/${entry.thumbnailRelPath}`)}`
                : '';
              return (
                <li key={r.videoId} className="p-3 flex gap-3">
                  <Link to={`/video/${r.videoId}`} className="shrink-0 w-24 aspect-video bg-slate-100 rounded overflow-hidden">
                    {thumb && <img src={thumb} className="w-full h-full object-cover" />}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={`/video/${r.videoId}`} className="font-medium text-sm hover:underline truncate block" title={r.title}>
                      {r.title}
                    </Link>
                    <ul className="mt-1 space-y-0.5">
                      {r.matches.slice(0, 3).map((m, i) => (
                        <li key={i}>
                          <Link
                            to={`/video/${r.videoId}?t=${Math.floor(m.segmentStart)}`}
                            className="text-xs text-slate-600 hover:text-slate-900 hover:underline block truncate"
                            title={m.snippet}
                          >
                            <span className="text-slate-400 font-mono mr-1">[{formatTime(m.segmentStart)}]</span>
                            {m.snippet}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
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
