import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/cn';
import type { SessionItem, SessionStage } from '@shared/types';

type BulletState = 'idle' | 'active' | 'done' | 'error';

function StageBullet({ index, state }: { index: number; state: BulletState }) {
  return (
    <div className={cn(
      'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 z-10 bg-white',
      state === 'done' && 'bg-green-500 border-green-500 text-white',
      state === 'active' && 'bg-slate-900 border-slate-900 text-white',
      state === 'error' && 'bg-red-500 border-red-500 text-white',
      state === 'idle' && 'border-slate-300 text-slate-500'
    )}>
      {state === 'done'
        ? <Check size={16} />
        : state === 'active'
          ? <Loader2 size={16} className="animate-spin" />
          : index}
    </div>
  );
}

const TERMINAL: SessionStage[] = ['summarized', 'transcribed', 'cancelled', 'error'];

export default function SessionDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [s, setS] = useState<SessionItem | null>(null);

  useEffect(() => {
    void window.api.sessions.get(id).then(setS);
    const off = window.api.sessions.onChange(items => {
      const found = items.find(x => x.id === id);
      setS(found ?? null);
    });
    return () => { off(); };
  }, [id]);

  if (!s) return <div className="p-8">Session not found.</div>;

  const importDone = s.stage !== 'importing-local' && s.stage !== 'importing-url';
  const transcribeDone = (['transcribed', 'summarizing', 'summarized'] as SessionStage[]).includes(s.stage);
  const summarizeDone = s.stage === 'summarized';

  const stage1: BulletState =
    s.stage === 'error' && !importDone ? 'error' :
    importDone ? 'done' : 'active';
  const stage2: BulletState =
    !importDone ? 'idle' :
    transcribeDone ? 'done' :
    s.stage === 'transcribing' ? 'active' :
    s.stage === 'error' ? 'error' : 'idle';
  const stage3: BulletState =
    !transcribeDone ? 'idle' :
    summarizeDone ? 'done' :
    s.stage === 'summarizing' ? 'active' : 'idle';

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-1">{s.title}</h1>
      <p className="text-sm text-slate-500 mb-6">
        Session {s.id} · started {new Date(s.startedAt).toLocaleTimeString()}
      </p>

      <div className="relative">
        <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-200" />

        <section className="relative mb-8 grid grid-cols-[2rem_1fr] gap-x-4 items-start">
          <StageBullet index={1} state={stage1} />
          <div>
            <h2 className="text-lg font-semibold leading-8 mb-1">Import</h2>
            {(s.stage === 'importing-local' || s.stage === 'importing-url') && (
              <div className="text-sm text-slate-600 bg-slate-50 border rounded p-3">
                <Loader2 size={14} className="inline animate-spin mr-1.5" />
                {s.progress?.message ?? '…'}
              </div>
            )}
            {importDone && s.videoId && <div className="text-sm text-slate-600">Imported.</div>}
          </div>
        </section>

        <section className={cn('relative mb-8 grid grid-cols-[2rem_1fr] gap-x-4 items-start',
                               !importDone && 'opacity-40 pointer-events-none')}>
          <StageBullet index={2} state={stage2} />
          <div>
            <h2 className="text-lg font-semibold leading-8 mb-1">Transcribe</h2>
            {s.stage === 'transcribing' && (
              <div className="text-sm text-slate-600 bg-slate-50 border rounded p-3 max-h-40 overflow-auto">
                {s.progress?.message || 'Working…'}
              </div>
            )}
            {transcribeDone && <div className="text-sm text-green-700">Transcription complete.</div>}
          </div>
        </section>

        <section className={cn('relative grid grid-cols-[2rem_1fr] gap-x-4 items-start',
                               !transcribeDone && 'opacity-40 pointer-events-none')}>
          <StageBullet index={3} state={stage3} />
          <div>
            <h2 className="text-lg font-semibold leading-8 mb-1">
              Summarize <span className="text-sm font-normal text-slate-500">(optional)</span>
            </h2>
            {s.stage === 'summarizing' && (
              <div className="text-sm text-slate-600 bg-slate-50 border rounded p-3">
                <Loader2 size={14} className="inline animate-spin mr-1.5" /> Generating summary…
              </div>
            )}
            {summarizeDone && <div className="text-sm text-green-700">Summary saved.</div>}
          </div>
        </section>

        {s.error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mt-4">
            {s.error}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          {s.videoId && (
            <Button variant="outline" onClick={() => nav(`/video/${s.videoId}`)}>
              Open video
            </Button>
          )}
          {!TERMINAL.includes(s.stage)
            ? <Button variant="outline" onClick={() => window.api.sessions.cancel(s.id)}>Cancel session</Button>
            : <Button variant="outline" onClick={() => window.api.sessions.dismiss(s.id).then(() => nav('/'))}>Dismiss</Button>}
        </div>
      </div>
    </div>
  );
}
