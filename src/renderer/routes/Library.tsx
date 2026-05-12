import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '@renderer/stores/library';
import { useSettings } from '@renderer/stores/settings';
import { VideoCard } from '@renderer/components/VideoCard';
import { Button } from '@renderer/components/ui/button';

export default function Library() {
  const { videos, refresh } = useLibrary();
  const { load: loadSettings } = useSettings();
  const [q, setQ] = useState('');

  useEffect(() => {
    void loadSettings().then(refresh);
  }, []);

  const filtered = videos.filter((v) => v.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Library</h1>
        <Link to="/new">
          <Button>+ New Video</Button>
        </Link>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search…"
        className="border rounded px-3 py-2 text-sm w-72 mb-4"
      />
      {filtered.length === 0 ? (
        <div className="text-slate-500 text-sm">
          No videos yet. Click "New Video" to import one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v) => (
            <VideoCard key={v.id} entry={v} />
          ))}
        </div>
      )}
    </div>
  );
}
