import { useParams } from 'react-router-dom';
import { useRef, useState } from 'react';
import { useVideo } from '@renderer/hooks/useVideo';
import { TranscriptView } from '@renderer/components/TranscriptView';
import { SummaryView } from '@renderer/components/SummaryView';
import { ChatPanel } from '@renderer/components/ChatPanel';
import { useLlmStream } from '@renderer/hooks/useIpcStream';
import { useSettings } from '@renderer/stores/settings';

export default function VideoDetail() {
  const { id } = useParams<{ id: string }>();
  const { meta, videoUrl, transcript, summary, chat, setSummary, setChat } = useVideo(id);
  const { settings } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tab, setTab] = useState<'transcript' | 'summary' | 'meta'>('transcript');
  const [regenBuf, setRegenBuf] = useState('');
  const [regenReq, setRegenReq] = useState<string | null>(null);

  useLlmStream(c => {
    if (c.requestId !== regenReq) return;
    if (c.error) { setRegenBuf(prev => prev + `\n[Error: ${c.error}]`); return; }
    if (c.done) {
      window.api.library.writeSummary(id!, regenBuf).then(() => setSummary(regenBuf));
      setRegenReq(null);
      return;
    }
    setRegenBuf(prev => prev + c.token);
  });

  if (!meta) return <div className="p-4">Loading…</div>;

  const onSeek = (sec: number) => { if (videoRef.current) videoRef.current.currentTime = sec; };

  const regenerate = async () => {
    if (!transcript || !settings) return;
    setRegenBuf('');
    const transcriptText = transcript.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    const models = await window.api.llm.listModels('ollama').catch(() => [] as string[]);
    const reqId = await window.api.llm.summarize({
      providerId: 'ollama', model: models[0] ?? 'llama3',
      transcript: transcriptText, systemPrompt: settings.prompts.summary
    });
    setRegenReq(reqId);
  };

  return (
    <div className="h-full flex">
      <div className="w-2/5 flex flex-col border-r">
        <video ref={videoRef} src={videoUrl} controls className="w-full bg-black aspect-video"/>
        <div className="flex border-b text-sm">
          {(['transcript','summary','meta'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
                    className={`px-4 py-2 ${tab === t ? 'border-b-2 border-slate-900 font-medium' : 'text-slate-600'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {tab === 'transcript' && transcript && <TranscriptView segments={transcript} onSeek={onSeek}/>}
          {tab === 'transcript' && !transcript && <div className="p-3 text-sm text-slate-500">No transcript.</div>}
          {tab === 'summary' && <SummaryView markdown={regenReq ? regenBuf : summary} onRegenerate={regenerate}/>}
          {tab === 'meta' && (
            <div className="p-3 text-sm space-y-1">
              <div><b>ID:</b> {meta.id}</div>
              <div><b>Status:</b> {meta.status}</div>
              <div><b>Duration:</b> {Math.floor(meta.durationSec)}s</div>
              <div><b>Created:</b> {meta.createdAt}</div>
              <div><b>Folder:</b> {meta.folderName}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex-1">
        <ChatPanel videoId={meta.id} transcript={transcript} summary={summary} initialChat={chat}
                   onSave={async h => { await window.api.library.writeChat(meta.id, h); setChat(h); }}/>
      </div>
    </div>
  );
}
