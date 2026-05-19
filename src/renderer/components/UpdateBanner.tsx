import { useEffect, useState } from 'react';
import { Download, X, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from './Toast';

const DISMISS_KEY = 'update-dismissed-version';

interface UpdateInfo {
  current: string;
  latest: string | null;
  isNewer: boolean;
  htmlUrl: string | null;
}

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; mb: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await window.api.system.checkLatest();
        if (cancelled) return;
        if (result.isNewer) {
          // Respect a per-version dismissal from a previous session.
          const skipped = localStorage.getItem(DISMISS_KEY);
          if (skipped !== result.latest) setInfo(result);
        }
      } catch { /* offline, no banner */ }
    })();

    const off = window.api.system.onDownloadProgress(p => {
      const pct = p.bytesTotal > 0 ? (p.bytesDownloaded / p.bytesTotal) * 100 : 0;
      const mb = `${(p.bytesDownloaded / 1024 / 1024).toFixed(1)} / ${(p.bytesTotal / 1024 / 1024).toFixed(0)} MB`;
      setProgress({ pct, mb });
    });

    return () => { cancelled = true; off(); };
  }, []);

  const dismiss = () => {
    if (info?.latest) localStorage.setItem(DISMISS_KEY, info.latest);
    setDismissed(true);
  };

  const download = async () => {
    setDownloading(true);
    setProgress({ pct: 0, mb: '0 / ? MB' });
    try {
      const { path } = await window.api.system.downloadUpdate();
      toast.success('Update downloaded — opening in Finder');
      await window.api.system.revealInFinder(path);
    } catch (e) {
      toast.error(`Download failed: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  const openReleasePage = () => {
    if (info?.htmlUrl) void window.api.system.openExternal(info.htmlUrl);
  };

  if (!info || dismissed) return null;

  return (
    <div className="border-b bg-blue-50 text-blue-900 px-4 py-2 flex items-center gap-3 text-sm">
      <div className="flex-1">
        <span className="font-medium">Update available:</span> v{info.latest}
        <span className="text-blue-700 ml-1">(you're on v{info.current})</span>
        {downloading && progress && (
          <span className="ml-3 text-blue-700">
            Downloading {progress.mb} ({progress.pct.toFixed(0)}%)
          </span>
        )}
      </div>
      <button
        onClick={openReleasePage}
        title="View release notes on GitHub"
        className="text-blue-700 hover:underline text-xs flex items-center gap-1"
      >
        Release notes <ExternalLink size={11} />
      </button>
      <Button
        onClick={download}
        disabled={downloading}
        className="gap-1.5 h-7 px-2 text-xs"
        title={
          process.platform === 'darwin'
            ? 'Downloads the .dmg to ~/Downloads and opens Finder. Drag the new app into Applications — no xattr re-run needed because the in-app download bypasses macOS quarantine.'
            : 'Downloads the new installer'
        }
      >
        {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {downloading ? 'Downloading…' : 'Download update'}
      </Button>
      <button onClick={dismiss} title="Dismiss for this version" className="text-blue-700 hover:bg-blue-100 rounded p-1">
        <X size={14} />
      </button>
    </div>
  );
}
