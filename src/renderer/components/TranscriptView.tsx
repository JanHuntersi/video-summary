import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { cn } from '@renderer/lib/cn';
import type { TranscriptSegment } from '@shared/types';

function ts(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (sec: number) => void;
}

export function TranscriptView({ segments, currentTime, onSeek }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [activeVisible, setActiveVisible] = useState(true);
  const [following, setFollowing] = useState(true);
  const autoScrollingRef = useRef(false);

  const activeIndex = useMemo(() => {
    for (let i = 0; i < segments.length; i++) {
      if (currentTime >= segments[i].start && currentTime < segments[i].end) return i;
    }
    let last = -1;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].start <= currentTime) last = i;
      else break;
    }
    return last;
  }, [segments, currentTime]);

  // Track whether the active segment is in viewport
  useEffect(() => {
    const root = containerRef.current;
    const el = activeRef.current;
    if (!root || !el) { setActiveVisible(true); return; }
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries[0]?.isIntersecting ?? false;
        setActiveVisible(visible);
        // If user manually scrolled away (visibility lost & not from auto-scroll), pause following
        if (!visible && !autoScrollingRef.current) setFollowing(false);
      },
      { root, threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [activeIndex]);

  // Auto-scroll on active-index change when following
  useEffect(() => {
    if (!following || activeIndex < 0) return;
    const el = activeRef.current;
    if (!el) return;
    autoScrollingRef.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => { autoScrollingRef.current = false; }, 700);
    return () => clearTimeout(t);
  }, [activeIndex, following]);

  const jumpToActive = () => {
    setFollowing(true);
    autoScrollingRef.current = true;
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { autoScrollingRef.current = false; }, 700);
  };

  return (
    <div ref={containerRef} className="overflow-auto h-full relative">
      {segments.map((s, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={i}
            ref={isActive ? activeRef : undefined}
            onClick={() => onSeek(s.start)}
            className={cn(
              'block w-full text-left px-3 py-1.5 text-sm transition-colors',
              isActive
                ? 'bg-amber-100 border-l-4 border-amber-500 font-medium'
                : 'hover:bg-slate-100 border-l-4 border-transparent'
            )}
          >
            <span className={cn('mr-2 font-mono', isActive ? 'text-amber-700' : 'text-slate-500')}>{ts(s.start)}</span>
            {s.text}
          </button>
        );
      })}
      {activeIndex >= 0 && !activeVisible && (
        <button
          onClick={jumpToActive}
          className="sticky bottom-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 hover:bg-slate-700 mx-auto"
        >
          <ArrowDown size={14} /> Jump to current
        </button>
      )}
    </div>
  );
}
