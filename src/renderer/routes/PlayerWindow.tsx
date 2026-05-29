import { useEffect, useRef, useState } from 'react';
import type { PlayerContext } from '@shared/types';

/**
 * Bare full-bleed video player rendered in the popped-out window. Applies seek/
 * play/pause commands relayed from the main window and reports its state back
 * (throttled) so the main window can keep transcript highlighting in sync.
 */
export default function PlayerWindow() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ctx, setCtx] = useState<PlayerContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const lastReportRef = useRef(0);

  useEffect(() => {
    window.api.player.getContext().then((c) => {
      if (c) {
        setCtx(c);
        document.title = c.title;
      } else {
        setError('No video context — open this window from the main app.');
      }
    });
  }, []);

  // Apply commands from the main window.
  useEffect(() => {
    const off = window.api.player.onCommand((cmd) => {
      const v = videoRef.current;
      if (!v) return;
      if (cmd.type === 'seek') {
        try { v.currentTime = cmd.t; } catch { /* ignore */ }
        if (cmd.play === true) void v.play().catch(() => {});
        else if (cmd.play === false) v.pause();
      } else if (cmd.type === 'play') {
        void v.play().catch(() => {});
      } else if (cmd.type === 'pause') {
        v.pause();
      }
    });
    return () => { off(); };
  }, []);

  const report = () => {
    const v = videoRef.current;
    if (!v) return;
    window.api.player.reportState({ currentTime: v.currentTime, duration: v.duration || 0, paused: v.paused });
  };

  const onTimeUpdate = () => {
    const now = performance.now();
    if (now - lastReportRef.current < 250) return; // throttle to ~4/s
    lastReportRef.current = now;
    report();
  };

  if (error) {
    return <div className="h-screen w-screen bg-black text-slate-300 flex items-center justify-center p-6 text-sm">{error}</div>;
  }

  return (
    <div className="h-screen w-screen bg-black">
      {ctx && (
        <video
          ref={videoRef}
          src={ctx.videoUrl}
          controls
          autoPlay
          className="h-full w-full bg-black"
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (v && !startedRef.current) {
              startedRef.current = true;
              try { v.currentTime = ctx.startTime; } catch { /* ignore */ }
            }
          }}
          onTimeUpdate={onTimeUpdate}
          onPlay={report}
          onPause={report}
          onSeeked={report}
          onError={() => {
            const err = videoRef.current?.error;
            const codeMap: Record<number, string> = { 1: 'aborted', 2: 'network', 3: 'decode', 4: 'src not supported' };
            setError(err ? `Cannot play video — MediaError ${err.code} (${codeMap[err.code] ?? '?'})` : 'Cannot play video');
          }}
        />
      )}
    </div>
  );
}
