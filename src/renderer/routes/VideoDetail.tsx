import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useVideo } from '@renderer/hooks/useVideo';
import { TranscriptView } from '@renderer/components/TranscriptView';
import { SummaryView } from '@renderer/components/SummaryView';
import { ChatPanel } from '@renderer/components/ChatPanel';
import { EditDetailsModal } from '@renderer/components/EditDetailsModal';
import { useLlmStream } from '@renderer/hooks/useIpcStream';
import { useSettings } from '@renderer/stores/settings';
import { toast } from '@renderer/components/Toast';
import { Button } from '@renderer/components/ui/button';
import type { VideoMeta } from '@shared/types';

type Tab = 'transcript' | 'summary' | 'info';

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { meta, videoUrl, transcript, summary, setSummary, setMeta } = useVideo(id);
  const { settings } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tab, setTab] = useState<Tab>('transcript');
  const [regenBuf, setRegenBuf] = useState('');
  const [regenReq, setRegenReq] = useState<string | null>(null);
  const [paths, setPaths] = useState<{ absSourcePath: string; absFolder: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    if (id) window.api.library.getPaths(id).then(p => setPaths({ absSourcePath: p.absSourcePath, absFolder: p.absFolder }));
  }, [id]);

  useLlmStream(c => {
    if (c.requestId !== regenReq) return;
    if (c.error) {
      toast.error(`Summary failed: ${c.error}`);
      setRegenReq(null);
      return;
    }
    if (c.done) {
      window.api.library.writeSummary(id!, regenBuf).then(() => {
        setSummary(regenBuf);
        toast.success('Summary regenerated');
      });
      setRegenReq(null);
      return;
    }
    setRegenBuf(prev => prev + c.token);
  });

  if (!meta) return <div className="p-4">Loading…</div>;

  const onSeek = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = sec;
    void v.play().catch(() => {});
  };

  const regenerate = async () => {
    if (!transcript || !settings) return;
    setRegenBuf('');
    const transcriptText = transcript.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    try {
      const models = await window.api.llm.listModels('ollama');
      if (!models.length) {
        toast.error('No Ollama models found. Is Ollama running?');
        return;
      }
      const reqId = await window.api.llm.summarize({
        providerId: 'ollama', model: models[0],
        transcript: transcriptText, systemPrompt: settings.prompts.summary
      });
      setRegenReq(reqId);
    } catch (e) {
      toast.error(`Cannot reach Ollama: ${(e as Error).message}`);
    }
  };

  const saveMeta = async (patch: Partial<VideoMeta>) => {
    const updated = await window.api.library.updateMeta(meta.id, patch);
    setMeta(updated);
    toast.success('Saved');
  };

  const deleteVideo = async () => {
    try {
      await window.api.library.delete(meta.id);
      toast.success('Video deleted');
      navigate('/');
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <header className="border-b px-4 py-3 flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate" title={meta.title}>{meta.title}</h1>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className="text-xs text-slate-500">
              {Math.floor(meta.durationSec / 60)}:{String(Math.floor(meta.durationSec % 60)).padStart(2, '0')} · {meta.status}
            </span>
            {(meta.tags ?? []).map(t => (
              <span key={t} className="text-xs bg-slate-100 text-slate-700 rounded px-1.5 py-0.5">{t}</span>
            ))}
            {(!meta.tags || meta.tags.length === 0) && (
              <span className="text-xs text-slate-400 italic">no tags</span>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)} className="gap-1.5">
          <Pencil size={14} /> Edit
        </Button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-2/5 flex flex-col border-r">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onTimeUpdate={e => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
            className="w-full bg-black aspect-video"
          />
          <div className="flex border-b text-sm">
            {(['transcript', 'summary', 'info'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 ${tab === t ? 'border-b-2 border-slate-900 font-medium' : 'text-slate-600'}`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden">
            {tab === 'transcript' && transcript && <TranscriptView segments={transcript} currentTime={currentTime} onSeek={onSeek} />}
            {tab === 'transcript' && !transcript && <div className="p-3 text-sm text-slate-500">No transcript.</div>}
            {tab === 'summary' && <SummaryView markdown={regenReq ? regenBuf : summary} onRegenerate={regenerate} />}
            {tab === 'info' && <InfoView meta={meta} paths={paths} onEditClick={() => setEditing(true)} />}
          </div>
        </div>
        <div className="flex-1">
          <ChatPanel videoId={meta.id} transcript={transcript} summary={summary} />
        </div>
      </div>

      {editing && <EditDetailsModal meta={meta} onClose={() => setEditing(false)} onSave={saveMeta} onDelete={deleteVideo} />}
    </div>
  );
}

function InfoView({
  meta, paths, onEditClick
}: {
  meta: VideoMeta;
  paths: { absSourcePath: string; absFolder: string } | null;
  onEditClick: () => void;
}) {
  return (
    <div className="p-4 text-sm space-y-3 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Details</h3>
        <Button variant="outline" onClick={onEditClick} className="gap-1.5"><Pencil size={14} /> Edit</Button>
      </div>
      <div><b>Title:</b> {meta.title}</div>
      <div>
        <b>Tags:</b>{' '}
        {(meta.tags ?? []).length > 0
          ? (meta.tags ?? []).map(t => <span key={t} className="inline-block bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-xs mr-1">{t}</span>)
          : <span className="text-slate-400 italic">none</span>}
      </div>
      {meta.notes && <div><b>Notes:</b><div className="mt-1 whitespace-pre-wrap text-slate-700">{meta.notes}</div></div>}

      <hr />

      <div className="space-y-1 text-slate-700">
        <div><b>ID:</b> {meta.id}</div>
        <div><b>Status:</b> {meta.status}</div>
        <div><b>Duration:</b> {Math.floor(meta.durationSec / 60)}:{String(Math.floor(meta.durationSec % 60)).padStart(2, '0')}</div>
        <div><b>Created:</b> {new Date(meta.createdAt).toLocaleString()}</div>
        <div><b>Original filename:</b> {meta.originalFilename}</div>
        <div className="break-all"><b>Video file:</b> <code className="bg-slate-100 px-1 rounded">{paths?.absSourcePath ?? '…'}</code></div>
        <div className="break-all"><b>Folder:</b> <code className="bg-slate-100 px-1 rounded">{paths?.absFolder ?? '…'}</code></div>
        {paths && (
          <Button variant="outline" className="mt-2" onClick={() => window.api.library.revealInFinder(paths.absSourcePath)}>
            Reveal in Finder
          </Button>
        )}
      </div>
    </div>
  );
}
