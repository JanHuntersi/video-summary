import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/cn';
import { toast } from '@renderer/components/Toast';

type ImportSource = 'local' | 'url';

export default function NewVideo() {
  const nav = useNavigate();
  const [source, setSource] = useState<ImportSource>('local');
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const pickFile = async () => {
    const f = await window.api.library.pickFile();
    if (f) {
      setSourcePath(f);
      setTitle(f.split('/').pop()!.replace(/\.[^.]+$/, ''));
    }
  };

  const startLocal = async () => {
    if (!sourcePath || !title) return;
    setBusy(true);
    try {
      const { id } = await window.api.sessions.startLocal(sourcePath, title);
      nav(`/sessions/${id}`);
    } catch (e) {
      setBusy(false);
      toast.error(`Could not start: ${(e as Error).message}`);
    }
  };

  const startUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const { id } = await window.api.sessions.startUrl(url.trim(), title || undefined);
      nav(`/sessions/${id}`);
    } catch (e) {
      setBusy(false);
      toast.error(`Could not start: ${(e as Error).message}`);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New Video</h1>

      <div className="inline-flex rounded-md border bg-white p-0.5 mb-4 text-sm">
        <button onClick={() => setSource('local')} disabled={busy}
                className={cn('px-3 py-1 rounded', source === 'local' ? 'bg-slate-900 text-white' : 'text-slate-700')}>
          Local file
        </button>
        <button onClick={() => setSource('url')} disabled={busy}
                className={cn('px-3 py-1 rounded', source === 'url' ? 'bg-slate-900 text-white' : 'text-slate-700')}>
          From URL
        </button>
      </div>

      {source === 'local' && (
        <div className="space-y-3">
          <Button variant="outline" onClick={pickFile} disabled={busy}>
            {sourcePath ? 'Change file…' : 'Choose video file…'}
          </Button>
          {sourcePath && (
            <>
              <div className="text-sm text-slate-600 break-all">{sourcePath}</div>
              <label className="block text-sm">Title<br />
                <input value={title} onChange={e => setTitle(e.target.value)}
                       className="border rounded px-2 py-1 w-full max-w-md" />
              </label>
              <Button onClick={startLocal} disabled={busy || !title}>
                {busy ? 'Starting…' : 'Start session'}
              </Button>
            </>
          )}
        </div>
      )}

      {source === 'url' && (
        <div className="space-y-3">
          <label className="block text-sm">YouTube / video URL<br />
            <input value={url} onChange={e => setUrl(e.target.value)} disabled={busy}
                   placeholder="https://www.youtube.com/watch?v=…"
                   className="border rounded px-2 py-1 w-full max-w-md" />
          </label>
          <label className="block text-sm">Title (optional override)<br />
            <input value={title} onChange={e => setTitle(e.target.value)} disabled={busy}
                   className="border rounded px-2 py-1 w-full max-w-md" />
          </label>
          <Button onClick={startUrl} disabled={busy || !url.trim()}>
            {busy ? 'Starting…' : 'Start session'}
          </Button>
        </div>
      )}
    </div>
  );
}
