import { useEffect, useState } from 'react';
import { Download, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from './Toast';

interface ModelRow {
  id: string;
  installed: boolean;
  sizeBytes: number | null;
}

// Order mirrors quality/size; the labels and notes are user-facing copy.
const META: Record<string, { sizeLabel: string; note: string }> = {
  tiny:   { sizeLabel: '~75 MB',  note: 'fastest, lowest quality' },
  base:   { sizeLabel: '~140 MB', note: 'fast, mediocre' },
  small:  { sizeLabel: '~480 MB', note: 'recommended default' },
  medium: { sizeLabel: '~1.5 GB', note: 'solid quality, slow' },
  turbo:  { sizeLabel: '~1.5 GB', note: 'near-large quality, faster' },
  large:  { sizeLabel: '~3 GB',   note: 'best quality, slowest' }
};

function fmtMB(bytes: number | null): string {
  if (!bytes) return '';
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function ModelManager() {
  const [rows, setRows] = useState<ModelRow[]>([]);
  const [downloading, setDownloading] = useState<Record<string, { pct: number; mb: string }>>({});
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    const list = await window.api.models.list();
    setRows(list);
    setLoaded(true);
  };

  useEffect(() => {
    void reload();
    const offProgress = window.api.models.onProgress(p => {
      const pct = p.total > 0 ? (p.downloaded / p.total) * 100 : 0;
      const mb = `${(p.downloaded / 1024 / 1024).toFixed(0)} / ${(p.total / 1024 / 1024).toFixed(0)} MB`;
      setDownloading(prev => ({ ...prev, [p.id]: { pct, mb } }));
    });
    const offDone = window.api.models.onDone(p => {
      setDownloading(prev => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      void reload();
      toast.success(`${p.id} downloaded`);
    });
    const offError = window.api.models.onError(p => {
      setDownloading(prev => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      toast.error(`${p.id} download failed: ${p.message}`);
    });
    return () => { offProgress(); offDone(); offError(); };
  }, []);

  const download = (id: string) => {
    setDownloading(prev => ({ ...prev, [id]: { pct: 0, mb: '0 / ? MB' } }));
    void window.api.models.download(id).catch(() => { /* error handled via event */ });
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete the ${id} model file? You can re-download it any time.`)) return;
    await window.api.models.delete(id);
    await reload();
    toast.success(`${id} removed`);
  };

  if (!loaded) return <div className="text-sm text-slate-500">Loading…</div>;

  return (
    <div className="border rounded">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50 text-xs text-slate-600 uppercase">
            <th className="text-left px-3 py-2">Model</th>
            <th className="text-left px-3 py-2">Size</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-right px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const meta = META[r.id] ?? { sizeLabel: '?', note: '' };
            const dl = downloading[r.id];
            return (
              <tr key={r.id} className="border-b last:border-b-0">
                <td className="px-3 py-2">
                  <div className="font-mono">{r.id}</div>
                  <div className="text-xs text-slate-500">{meta.note}</div>
                </td>
                <td className="px-3 py-2 text-slate-600">{meta.sizeLabel}</td>
                <td className="px-3 py-2">
                  {dl ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-blue-600" />
                      <span className="text-xs text-slate-600">{dl.mb} ({dl.pct.toFixed(0)}%)</span>
                    </div>
                  ) : r.installed ? (
                    <div className="flex items-center gap-1.5 text-green-700">
                      <CheckCircle2 size={14} />
                      <span className="text-xs">Installed ({fmtMB(r.sizeBytes)})</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500">Not downloaded</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {dl ? (
                    <span className="text-xs text-slate-500">Downloading…</span>
                  ) : r.installed ? (
                    <Button variant="ghost" onClick={() => remove(r.id)} className="h-7 px-2 text-xs gap-1.5">
                      <Trash2 size={12} /> Delete
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => download(r.id)} className="h-7 px-2 text-xs gap-1.5">
                      <Download size={12} /> Download
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
