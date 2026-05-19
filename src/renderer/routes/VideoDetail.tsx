import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Pencil, Sparkles, ListChecks, Loader2, RotateCcw } from 'lucide-react';
import { useVideo } from '@renderer/hooks/useVideo';
import { TranscriptView } from '@renderer/components/TranscriptView';
import { SummaryView } from '@renderer/components/SummaryView';
import { ChatPanel } from '@renderer/components/ChatPanel';
import { MarkdownWithTimestamps } from '@renderer/components/MarkdownWithTimestamps';
import { NotesView } from '@renderer/components/NotesView';
import { EditDetailsModal } from '@renderer/components/EditDetailsModal';
import { formatTranscriptForLlm } from '@renderer/lib/transcriptFormat';
import { useLlmStream } from '@renderer/hooks/useIpcStream';
import { useSettings } from '@renderer/stores/settings';
import { toast } from '@renderer/components/Toast';
import { Button } from '@renderer/components/ui/button';
import type { VideoMeta } from '@shared/types';

type Tab = 'transcript' | 'summary' | 'highlights' | 'notes' | 'info';

const HIGHLIGHTS_PROMPT =
  'Extract the 5–10 most important moments from this video transcript. ' +
  'Output as a bulleted markdown list. Each item must start with a timestamp in [HH:MM:SS] form ' +
  '(copied verbatim from the transcript, never reformatted), followed by a 1-line description. ' +
  'Example:\n- [00:14:31] Speaker introduces the data sync flow.';

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const seekParam = searchParams.get('t');
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
  const [metaReady, setMetaReady] = useState(false);
  const seekAppliedRef = useRef(false);

  // Quick summary
  const [quickReq, setQuickReq] = useState<string | null>(null);
  const [quickBuf, setQuickBuf] = useState('');

  // Highlights
  const [highlights, setHighlights] = useState<string>('');
  const [highlightsReq, setHighlightsReq] = useState<string | null>(null);
  const [highlightsBuf, setHighlightsBuf] = useState('');
  const highlightsChatIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (id) window.api.library.getPaths(id).then(p => setPaths({ absSourcePath: p.absSourcePath, absFolder: p.absFolder }));
  }, [id]);

  // Load existing highlights chat (if any) when video loads
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const chats = await window.api.library.listChats(id);
        const hi = chats.find(c => c.title === 'Highlights');
        if (hi) {
          highlightsChatIdRef.current = hi.id;
          const rec = await window.api.library.readChatById(id, hi.id);
          const last = rec?.messages.filter(m => m.role === 'assistant').pop();
          if (last) setHighlights(last.content);
        }
      } catch {
        // ignore
      }
    })();
  }, [id]);

  // Seek to ?t= when video metadata loaded
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !seekParam || !metaReady || seekAppliedRef.current) return;
    const t = parseFloat(seekParam);
    if (!Number.isFinite(t)) return;
    seekAppliedRef.current = true;
    try {
      v.currentTime = t;
      void v.play().catch(() => {});
    } catch {
      // ignore
    }
  }, [seekParam, metaReady, videoUrl]);

  useLlmStream(c => {
    if (c.requestId === regenReq) {
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
      return;
    }
    if (c.requestId === quickReq) {
      if (c.error) {
        toast.error(`Quick summary failed: ${c.error}`);
        setQuickReq(null);
        return;
      }
      if (c.done) {
        const finalText = quickBuf;
        window.api.library.writeSummary(id!, finalText).then(() => {
          setSummary(finalText);
          toast.success('Quick summary saved');
        });
        setQuickReq(null);
        return;
      }
      setQuickBuf(prev => {
        const next = prev + c.token;
        setSummary(next);
        return next;
      });
      return;
    }
    if (c.requestId === highlightsReq) {
      if (c.error) {
        toast.error(`Highlights failed: ${c.error}`);
        setHighlightsReq(null);
        return;
      }
      if (c.done) {
        const finalText = highlightsBuf;
        setHighlights(finalText);
        // Persist as a chat titled "Highlights"
        (async () => {
          try {
            let chatId = highlightsChatIdRef.current;
            if (!chatId) {
              const created = await window.api.library.createChat(id!, 'Highlights');
              chatId = created.id;
              highlightsChatIdRef.current = chatId;
            }
            const now = new Date().toISOString();
            await window.api.library.writeChatById(id!, {
              id: chatId!,
              title: 'Highlights',
              createdAt: now,
              lastMessageAt: now,
              systemPromptUsed: HIGHLIGHTS_PROMPT,
              messages: [{ role: 'assistant', content: finalText, createdAt: now }]
            });
            toast.success('Highlights saved');
          } catch (e) {
            toast.error(`Could not persist highlights: ${(e as Error).message}`);
          }
        })();
        setHighlightsReq(null);
        return;
      }
      setHighlightsBuf(prev => prev + c.token);
    }
  });

  // Keyboard shortcuts (when not typing in an input/textarea)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const v = videoRef.current;
      if (!v) return;
      const segs = transcript ?? [];
      const findActiveIdx = () => {
        for (let i = 0; i < segs.length; i++) {
          if (v.currentTime >= segs[i].start && v.currentTime < segs[i].end) return i;
        }
        let last = -1;
        for (let i = 0; i < segs.length; i++) {
          if (segs[i].start <= v.currentTime) last = i; else break;
        }
        return last;
      };
      if (e.key === ' ') {
        e.preventDefault();
        if (v.paused) void v.play().catch(() => {}); else v.pause();
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        v.currentTime = Math.max(0, v.currentTime - 5);
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        v.currentTime = Math.min((v.duration || Infinity), v.currentTime + 5);
      } else if (e.key === 'ArrowLeft' && segs.length) {
        e.preventDefault();
        const idx = findActiveIdx();
        if (idx > 0) { v.currentTime = segs[idx - 1].start; void v.play().catch(() => {}); }
      } else if (e.key === 'ArrowRight' && segs.length) {
        e.preventDefault();
        const idx = findActiveIdx();
        if (idx >= 0 && idx + 1 < segs.length) { v.currentTime = segs[idx + 1].start; void v.play().catch(() => {}); }
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        setTab('transcript');
        // active row will be auto-scrolled by TranscriptView if following; else clicking Jump button required
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [transcript]);

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
    const transcriptText = formatTranscriptForLlm(transcript);
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

  const quickSummary = async () => {
    if (!transcript || !settings) return;
    if (!settings.defaultLlm?.model) {
      toast.error('Set a default LLM model in Settings → Workflow');
      return;
    }
    setTab('summary');
    setQuickBuf('');
    setSummary('');
    const transcriptText = formatTranscriptForLlm(transcript);
    try {
      const reqId = await window.api.llm.summarize({
        providerId: settings.defaultLlm.providerId,
        model: settings.defaultLlm.model,
        transcript: transcriptText,
        systemPrompt: settings.prompts.summary
      });
      setQuickReq(reqId);
    } catch (e) {
      toast.error(`Quick summary failed: ${(e as Error).message}`);
    }
  };

  const generateHighlights = async () => {
    if (!transcript || !settings) return;
    if (!settings.defaultLlm?.model) {
      toast.error('Set a default LLM model in Settings → Workflow');
      return;
    }
    setTab('highlights');
    setHighlightsBuf('');
    setHighlights('');
    const transcriptText = formatTranscriptForLlm(transcript);
    try {
      const reqId = await window.api.llm.summarize({
        providerId: settings.defaultLlm.providerId,
        model: settings.defaultLlm.model,
        transcript: transcriptText,
        systemPrompt: HIGHLIGHTS_PROMPT
      });
      setHighlightsReq(reqId);
    } catch (e) {
      toast.error(`Highlights failed: ${(e as Error).message}`);
    }
  };

  const reTranscribe = async () => {
    if (!meta || !settings) return;
    if (!confirm('Re-run transcription? This will overwrite the existing transcript.')) return;
    try {
      const model = meta.transcription?.model ?? settings.whisper.defaultModel;
      const language = meta.transcription?.language ?? 'auto';
      await window.api.transcription.start(meta.id, model, language);
      toast.success('Re-transcription queued');
    } catch (e) {
      toast.error(`Could not start: ${(e as Error).message}`);
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

  const displayedHighlights = highlightsReq ? highlightsBuf : highlights;

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
        <div className="flex items-center gap-2">
          {(() => {
            const reason =
              !transcript ? 'No transcript yet — transcribe the video first' :
              !settings?.defaultLlm?.model ? 'Set a default LLM model in Settings → Workflow' :
              quickReq ? 'Quick summary in progress' :
              '';
            return (
              <span title={reason}>
                <Button variant="outline" onClick={quickSummary} disabled={!!reason} title={reason} className="gap-1.5">
                  {quickReq ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Quick summary
                </Button>
              </span>
            );
          })()}
          {(() => {
            const reason =
              !transcript ? 'No transcript yet — transcribe the video first' :
              !settings?.defaultLlm?.model ? 'Set a default LLM model in Settings → Workflow' :
              highlightsReq ? 'Highlights generation in progress' :
              '';
            return (
              <span title={reason}>
                <Button variant="outline" onClick={generateHighlights} disabled={!!reason} title={reason} className="gap-1.5">
                  {highlightsReq ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />}
                  Highlight key moments
                </Button>
              </span>
            );
          })()}
          {(() => {
            const reason = meta.status === 'transcribing'
              ? 'Transcription already running'
              : 'Re-run whisper on the current source file (overwrites transcript)';
            const disabled = meta.status === 'transcribing';
            return (
              <span title={reason}>
                <Button variant="outline" onClick={reTranscribe} disabled={disabled} title={reason} className="gap-1.5">
                  <RotateCcw size={14} /> Re-transcribe
                </Button>
              </span>
            );
          })()}
          <Button variant="outline" onClick={() => setEditing(true)} className="gap-1.5">
            <Pencil size={14} /> Edit
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-2/5 flex flex-col border-r">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onLoadedMetadata={() => setMetaReady(true)}
            onTimeUpdate={e => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
            onError={e => {
              const err = (e.target as HTMLVideoElement).error;
              const codeMap: Record<number, string> = {
                1: 'aborted', 2: 'network', 3: 'decode', 4: 'src not supported'
              };
              const detail = err ? `MediaError code ${err.code} (${codeMap[err.code] ?? '?'}): ${err.message || 'no message'}` : 'unknown';
              console.error('[video] playback error:', detail, 'src=', videoUrl);
              toast.error(`Cannot play video — ${detail}`);
            }}
            className="w-full bg-black aspect-video"
          />
          <div className="flex border-b text-sm">
            {(['transcript', 'summary', 'highlights', 'notes', 'info'] as const).map(t => (
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
            {tab === 'summary' && <SummaryView markdown={regenReq ? regenBuf : summary} onRegenerate={regenerate} onSeek={onSeek} />}
            {tab === 'highlights' && (
              <div className="p-4 overflow-auto h-full">
                {!displayedHighlights && !highlightsReq && (
                  <div className="text-sm text-slate-500">
                    No highlights yet. Click <b>Highlight key moments</b> above to generate.
                  </div>
                )}
                {displayedHighlights && (
                  <MarkdownWithTimestamps text={displayedHighlights} onSeek={onSeek} />
                )}
                {highlightsReq && (
                  <div className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> generating…
                  </div>
                )}
              </div>
            )}
            {tab === 'notes' && <NotesView videoId={meta.id} onSeek={onSeek} />}
            {tab === 'info' && <InfoView meta={meta} paths={paths} onEditClick={() => setEditing(true)} />}
          </div>
        </div>
        <div className="flex-1">
          <ChatPanel videoId={meta.id} transcript={transcript} summary={summary} onSeek={onSeek} />
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
