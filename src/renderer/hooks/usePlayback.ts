import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

interface Args {
  videoRef: RefObject<HTMLVideoElement>;
  videoId: string;
  videoUrl: string;
  title: string;
}

interface SeekOpts {
  /** true → play after seeking, false → pause, undefined → leave play state unchanged. */
  play?: boolean;
}

/**
 * Unified playback controller that targets either the inline `<video>` element or
 * a popped-out player window. Callers use the same `seek`/`togglePlay`/`nudge`
 * regardless of where the video currently lives; `currentTime` always reflects the
 * active source (local `timeupdate` inline, throttled state reports when popped).
 */
export function usePlayback({ videoRef, videoId, videoUrl, title }: Args) {
  const [isPopped, setIsPopped] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const poppedRef = useRef(false);
  const remoteTimeRef = useRef(0);
  const remotePausedRef = useRef(true);

  useEffect(() => {
    poppedRef.current = isPopped;
  }, [isPopped]);

  useEffect(() => {
    const offState = window.api.player.onState((s) => {
      remoteTimeRef.current = s.currentTime;
      remotePausedRef.current = s.paused;
      if (poppedRef.current) setCurrentTime(s.currentTime);
    });
    const offClosed = window.api.player.onClosed(() => {
      poppedRef.current = false;
      setIsPopped(false);
      const v = videoRef.current;
      if (v) {
        try { v.currentTime = remoteTimeRef.current; } catch { /* ignore */ }
      }
      setCurrentTime(remoteTimeRef.current);
    });
    return () => { offState(); offClosed(); };
  }, [videoRef]);

  // Close the pop-out if the host view unmounts (e.g. navigating away).
  useEffect(() => {
    return () => {
      if (poppedRef.current) void window.api.player.close();
    };
  }, []);

  const nowTime = useCallback((): number => {
    if (poppedRef.current) return remoteTimeRef.current;
    return videoRef.current?.currentTime ?? 0;
  }, [videoRef]);

  const isPaused = useCallback((): boolean => {
    if (poppedRef.current) return remotePausedRef.current;
    return videoRef.current?.paused ?? true;
  }, [videoRef]);

  const seek = useCallback((t: number, opts: SeekOpts = {}) => {
    if (poppedRef.current) {
      window.api.player.sendCommand({ type: 'seek', t, play: opts.play });
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    try { v.currentTime = t; } catch { /* ignore */ }
    if (opts.play === true) void v.play().catch(() => {});
    else if (opts.play === false) v.pause();
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    if (poppedRef.current) {
      window.api.player.sendCommand(remotePausedRef.current ? { type: 'play' } : { type: 'pause' });
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {}); else v.pause();
  }, [videoRef]);

  const nudge = useCallback((delta: number) => {
    seek(Math.max(0, nowTime() + delta));
  }, [seek, nowTime]);

  const popOut = useCallback(() => {
    const startTime = videoRef.current?.currentTime ?? 0;
    videoRef.current?.pause();
    poppedRef.current = true;
    setIsPopped(true);
    void window.api.player.open(videoId, { videoUrl, title, startTime });
  }, [videoRef, videoId, videoUrl, title]);

  const closePop = useCallback(() => {
    void window.api.player.close();
  }, []);

  /** Wire to the inline `<video>` `onTimeUpdate`; ignored while popped. */
  const onLocalTimeUpdate = useCallback((t: number) => {
    if (!poppedRef.current) setCurrentTime(t);
  }, []);

  return { isPopped, currentTime, nowTime, isPaused, seek, togglePlay, nudge, popOut, closePop, onLocalTimeUpdate };
}
