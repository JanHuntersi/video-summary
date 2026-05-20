import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { useSettings } from '@renderer/stores/settings';
import { useLlmStream, useTranscriptionEvents } from '@renderer/hooks/useIpcStream';
import { cn } from '@renderer/lib/cn';
import { toast } from '@renderer/components/Toast';
import type { LlmProviderId, VideoMeta } from '@shared/types';

type StageState = 'idle' | 'active' | 'done' | 'error';
type ImportSource = 'local' | 'url';

function StageBullet({ index, state }: { index: number; state: StageState }) {
  return (
    <div
      className={cn(
        'shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 z-10 bg-white',
        state === 'done' && 'bg-green-500 border-green-500 text-white',
        state === 'active' && 'bg-slate-900 border-slate-900 text-white',
        state === 'error' && 'bg-red-500 border-red-500 text-white',
        state === 'idle' && 'border-slate-300 text-slate-500'
      )}
    >
      {state === 'done' ? <Check size={16} /> : state === 'active' ? <Loader2 size={16} className="animate-spin" /> : index}
    </div>
  );
}

export default function NewVideo() {
  const nav = useNavigate();
  const { settings, load } = useSettings();

  // Stage 1 — import (local or url)
  const [importSource, setImportSource] = useState<ImportSource>('local');
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [importing, setImporting] = useState(false);
  const [meta, setMeta] = useState<VideoMeta | null>(null);

  // URL import
  const [url, setUrl] = useState('');
  const [probing, setProbing] = useState(false);
  const [probed, setProbed] = useState<{ title: string; durationSec: number; thumbnailUrl?: string } | null>(null);
  const [urlRequestId, setUrlRequestId] = useState<string | null>(null);
  const [urlProgress, setUrlProgress] = useState<string>('');
  const urlRequestIdRef = useRef<string | null>(null);

  // Stage 2 — transcribe
  const [model, setModel] = useState<'tiny' | 'base' | 'small' | 'medium' | 'turbo' | 'large'>('turbo');
  const [language, setLanguage] = useState('auto');
  const [transcribing, setTranscribing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Stage 3 — summarize
  const [providerId, setProviderId] = useState<LlmProviderId>('ollama');
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [llmModel, setLlmModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [activeReq, setActiveReq] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Auto-flow guards
  const autoTranscribeStartedRef = useRef(false);
  const autoSummarizeStartedRef = useRef(false);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (settings) {
      setModel(settings.whisper.defaultModel);
      setSystemPrompt(settings.prompts.summary);
      if (settings.defaultLlm?.providerId) setProviderId(settings.defaultLlm.providerId);
      if (settings.defaultLlm?.model) setLlmModel(settings.defaultLlm.model);
    }
  }, [settings]);
  useEffect(() => {
    window.api.llm.listModels(providerId)
      .then(models => {
        setLlmModels(models);
        // If a defaultLlm model exists for this provider and is available, prefer it.
        if (settings?.defaultLlm?.providerId === providerId && settings.defaultLlm.model && models.includes(settings.defaultLlm.model)) {
          setLlmModel(settings.defaultLlm.model);
        }
      })
      .catch(e => {
        setLlmModels([]);
        toast.error(`${providerId === 'ollama' ? 'Ollama' : 'Gemini'} unreachable: ${(e as Error).message}`);
      });
  }, [providerId, settings]);

  // Subscribe to yt-dlp events
  useEffect(() => {
    const offP = window.api.ytdlp.onProgress(p => {
      if (p.requestId !== urlRequestIdRef.current) return;
      setUrlProgress(`${p.phase}: ${p.message}`);
    });
    const offD = window.api.ytdlp.onDone(p => {
      if (p.requestId !== urlRequestIdRef.current) return;
      setUrlProgress('');
      setImporting(false);
      setUrlRequestId(null);
      urlRequestIdRef.current = null;
      setMeta(p.meta);
      toast.success('Downloaded & imported');
    });
    const offE = window.api.ytdlp.onError(p => {
      if (p.requestId !== urlRequestIdRef.current) return;
      setUrlProgress('');
      setImporting(false);
      setUrlRequestId(null);
      urlRequestIdRef.current = null;
      toast.error(`URL import failed: ${p.message}`);
    });
    return () => { offP(); offD(); offE(); };
  }, []);

  useTranscriptionEvents({
    onProgress: p => { if (meta && p.videoId === meta.id) setProgressText(p.partialText); },
    onDone: async p => {
      if (!meta || p.videoId !== meta.id) return;
      setTranscribing(false);
      const updated = await window.api.library.getMeta(meta.id);
      setMeta(updated);
      toast.success('Transcription complete');
    },
    onError: p => {
      if (meta && p.videoId === meta.id) {
        setTranscribing(false);
        setTranscribeError(p.message);
        toast.error(`Transcription failed: ${p.message}`);
      }
    }
  });

  useLlmStream(c => {
    if (c.requestId !== activeReq) return;
    if (c.error) { setSummaryError(c.error); setSummarizing(false); toast.error(`Summary failed: ${c.error}`); return; }
    if (c.done) { setSummarizing(false); return; }
    setSummary(prev => prev + c.token);
  });

  const pickFile = async () => {
    const f = await window.api.library.pickFile();
    if (f) {
      setSourcePath(f);
      setTitle(f.split('/').pop()!.replace(/\.[^.]+$/, ''));
    }
  };

  const runImport = async () => {
    if (!sourcePath) return;
    setImporting(true);
    try {
      const m = await window.api.library.import(sourcePath, title);
      setMeta(m);
    } finally { setImporting(false); }
  };

  const probeUrl = async () => {
    if (!url.trim()) return;
    setProbing(true);
    try {
      const info = await window.api.library.probeUrl(url.trim());
      setProbed(info);
      setTitle(info.title);
    } catch (e) {
      toast.error(`Probe failed: ${(e as Error).message}`);
    } finally {
      setProbing(false);
    }
  };

  const runUrlImport = async () => {
    if (!url.trim() || !probed) return;
    setImporting(true);
    setUrlProgress('Starting download…');
    try {
      const { requestId } = await window.api.library.startUrlImport(url.trim(), title || undefined);
      setUrlRequestId(requestId);
      urlRequestIdRef.current = requestId;
    } catch (e) {
      setImporting(false);
      setUrlProgress('');
      toast.error(`Could not start URL import: ${(e as Error).message}`);
    }
  };

  const cancelUrlImport = async () => {
    if (!urlRequestId) return;
    try {
      await window.api.ytdlp.cancel(urlRequestId);
    } catch {
      // ignore
    }
    setImporting(false);
    setUrlProgress('');
    setUrlRequestId(null);
    urlRequestIdRef.current = null;
  };

  const runTranscribe = async () => {
    if (!meta) return;
    setTranscribeError(null);
    setTranscribing(true);
    setProgressText('Starting…');
    await window.api.transcription.start(meta.id, model, language);
  };

  const runSummarize = async () => {
    if (!meta || !llmModel) return;
    const tr = await window.api.library.readTranscript(meta.id);
    if (!tr) return;
    const transcriptText = tr.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    setSummary('');
    setSummaryError(null);
    setSummarizing(true);
    try {
      const reqId = await window.api.llm.summarize({ providerId, model: llmModel, transcript: transcriptText, systemPrompt });
      setActiveReq(reqId);
    } catch (e) {
      setSummarizing(false);
      setSummaryError((e as Error).message);
      toast.error(`Cannot start summary: ${(e as Error).message}`);
    }
  };

  // Auto-flow: after import → transcribe
  useEffect(() => {
    if (!meta || !settings?.autoTranscribe) return;
    if (autoTranscribeStartedRef.current) return;
    if (transcribing || meta.status === 'transcribed' || meta.status === 'summarized') return;
    autoTranscribeStartedRef.current = true;
    void runTranscribe();
  }, [meta, settings]);

  // Auto-flow: after transcription → summarize
  useEffect(() => {
    if (!meta || !settings?.autoSummarize) return;
    if (autoSummarizeStartedRef.current) return;
    if (!(meta.status === 'transcribed')) return;
    const defModel = settings.defaultLlm?.model;
    const defProv = settings.defaultLlm?.providerId;
    if (!defModel || !defProv) return;
    autoSummarizeStartedRef.current = true;
    // ensure provider/model state are set, then summarize
    setProviderId(defProv);
    setLlmModel(defModel);
    // small defer so state propagation completes, then call summarize directly with explicit values
    void (async () => {
      const tr = await window.api.library.readTranscript(meta.id);
      if (!tr) return;
      const transcriptText = tr.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
      setSummary('');
      setSummaryError(null);
      setSummarizing(true);
      try {
        const reqId = await window.api.llm.summarize({
          providerId: defProv, model: defModel,
          transcript: transcriptText, systemPrompt
        });
        setActiveReq(reqId);
      } catch (e) {
        setSummarizing(false);
        setSummaryError((e as Error).message);
        toast.error(`Auto-summary failed: ${(e as Error).message}`);
      }
    })();
  }, [meta, settings, systemPrompt]);

  const saveAndOpen = async () => {
    if (!meta) return;
    await window.api.library.writeSummary(meta.id, summary);
    await window.api.library.updateMeta(meta.id, {
      status: 'summarized',
      summary: { provider: providerId, model: llmModel, systemPrompt, generatedAt: new Date().toISOString() }
    });
    nav(`/video/${meta.id}`);
  };

  const transcribed = meta?.status === 'transcribed' || meta?.status === 'summarized';
  const summarized = meta?.status === 'summarized' || summary.length > 0;

  const stage1State: StageState = meta ? 'done' : importing ? 'active' : 'idle';
  const stage2State: StageState = transcribeError ? 'error' : transcribed ? 'done' : transcribing ? 'active' : 'idle';
  const stage3State: StageState = summaryError ? 'error' : (summarized && !summarizing) ? 'done' : summarizing ? 'active' : 'idle';

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New Video</h1>

      <div className="relative">
        <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-200" />

        {/* Stage 1 */}
        <section className="relative mb-8 grid grid-cols-[2rem_1fr] gap-x-4 items-start">
          <StageBullet index={1} state={stage1State} />
          <div>
            <h2 className="text-lg font-semibold leading-8 mb-3">Import</h2>

            {!meta && (
              <div className="inline-flex rounded-md border bg-white p-0.5 mb-3 text-sm">
                <button
                  onClick={() => setImportSource('local')}
                  disabled={importing}
                  className={cn('px-3 py-1 rounded', importSource === 'local' ? 'bg-slate-900 text-white' : 'text-slate-700')}>
                  Local file
                </button>
                <button
                  onClick={() => setImportSource('url')}
                  disabled={importing}
                  className={cn('px-3 py-1 rounded', importSource === 'url' ? 'bg-slate-900 text-white' : 'text-slate-700')}>
                  From URL
                </button>
              </div>
            )}

            <div className="space-y-3">
              {!meta && importSource === 'local' && (
                <>
                  <Button variant="outline" onClick={pickFile} disabled={importing}>
                    {sourcePath ? 'Change file…' : 'Choose video file…'}
                  </Button>
                  {sourcePath && (
                    <>
                      <div className="text-sm text-slate-600 break-all">{sourcePath}</div>
                      <label className="block text-sm">Title<br />
                        <input value={title} onChange={e => setTitle(e.target.value)} className="border rounded px-2 py-1 w-full max-w-md" />
                      </label>
                      <Button onClick={runImport} disabled={importing || !title}>
                        {importing ? 'Importing…' : 'Import'}
                      </Button>
                    </>
                  )}
                </>
              )}

              {!meta && importSource === 'url' && (
                <>
                  <label className="block text-sm">YouTube / video URL<br />
                    <input value={url} onChange={e => setUrl(e.target.value)}
                           placeholder="https://www.youtube.com/watch?v=…"
                           disabled={importing}
                           className="border rounded px-2 py-1 w-full max-w-md" />
                  </label>
                  {!probed && (
                    <Button variant="outline" onClick={probeUrl} disabled={probing || importing || !url.trim()}>
                      {probing ? 'Fetching…' : 'Fetch info'}
                    </Button>
                  )}
                  {probed && (
                    <>
                      <div className="text-sm text-slate-600">
                        Duration: {Math.floor(probed.durationSec / 60)}:{String(Math.floor(probed.durationSec % 60)).padStart(2, '0')}
                      </div>
                      <label className="block text-sm">Title<br />
                        <input value={title} onChange={e => setTitle(e.target.value)} disabled={importing}
                               className="border rounded px-2 py-1 w-full max-w-md" />
                      </label>
                      {!importing && (
                        <Button onClick={runUrlImport} disabled={!title}>
                          Download & Import
                        </Button>
                      )}
                      {importing && (
                        <div className="space-y-2">
                          <div className="text-sm text-slate-600 bg-slate-50 border rounded p-3">
                            <Loader2 size={14} className="inline animate-spin mr-1.5" />
                            {urlProgress || 'Downloading…'}
                          </div>
                          <Button variant="outline" onClick={cancelUrlImport}>Cancel</Button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {meta && (
                <div className="text-sm text-slate-600">Imported as <b>{meta.title}</b> ({Math.floor(meta.durationSec)}s)</div>
              )}
            </div>
          </div>
        </section>

        {/* Stage 2 */}
        <section className={cn('relative mb-8 grid grid-cols-[2rem_1fr] gap-x-4 items-start transition-opacity', !meta && 'opacity-40 pointer-events-none')}>
          <StageBullet index={2} state={stage2State} />
          <div>
            <h2 className="text-lg font-semibold leading-8 mb-3">Transcribe</h2>
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap text-sm">
                <label>Model&nbsp;
                  <select value={model} onChange={e => setModel(e.target.value as 'tiny' | 'base' | 'small' | 'medium' | 'turbo' | 'large')}
                    className="border rounded px-2 py-1" disabled={transcribing || transcribed}>
                    {['tiny', 'base', 'small', 'medium', 'turbo', 'large'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </label>
                <label>Language&nbsp;
                  <select value={language} onChange={e => setLanguage(e.target.value)}
                    className="border rounded px-2 py-1" disabled={transcribing || transcribed}>
                    <option value="auto">auto</option>
                    {['en', 'sl', 'de', 'fr', 'es', 'it'].map(l => <option key={l}>{l}</option>)}
                  </select>
                </label>
              </div>
              {!transcribed && !transcribing && (
                <Button onClick={runTranscribe} disabled={!meta}>Start transcription</Button>
              )}
              {transcribing && (
                <div className="text-sm text-slate-600 bg-slate-50 border rounded p-3 max-h-40 overflow-auto">{progressText}</div>
              )}
              {transcribeError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                  {transcribeError} <button className="underline ml-2" onClick={runTranscribe}>Retry</button>
                </div>
              )}
              {transcribed && (
                <div className="text-sm text-green-700">Transcription complete.</div>
              )}
            </div>
          </div>
        </section>

        {/* Stage 3 */}
        <section className={cn('relative grid grid-cols-[2rem_1fr] gap-x-4 items-start transition-opacity', !transcribed && 'opacity-40 pointer-events-none')}>
          <StageBullet index={3} state={stage3State} />
          <div>
            <h2 className="text-lg font-semibold leading-8 mb-3">Summarize <span className="font-normal text-sm text-slate-500">(optional)</span></h2>
            <div className="space-y-3">
            <div className="flex gap-3 flex-wrap text-sm">
              <label>Provider&nbsp;
                <select value={providerId} onChange={e => setProviderId(e.target.value as LlmProviderId)}
                  className="border rounded px-2 py-1" disabled={summarizing}>
                  <option value="ollama">Ollama</option>
                  {settings?.gemini.hasKey && <option value="gemini">Gemini</option>}
                </select>
              </label>
              <label>Model&nbsp;
                <select value={llmModel} onChange={e => setLlmModel(e.target.value)}
                  className="border rounded px-2 py-1" disabled={summarizing}>
                  <option value="">— select —</option>
                  {llmModels.map(m => <option key={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-sm">System prompt
              <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                disabled={summarizing}
                className="w-full border rounded p-2 text-sm h-24 mt-1" />
            </label>
            <div className="flex gap-2">
              <Button onClick={runSummarize} disabled={summarizing || !llmModel || !transcribed}>
                {summarizing ? 'Generating…' : summary ? 'Regenerate' : 'Generate summary'}
              </Button>
              {meta && (
                <Button variant="outline" onClick={() => nav(`/video/${meta.id}`)}>
                  {summary ? 'Skip' : 'Skip & open'}
                </Button>
              )}
              {summary && !summarizing && (
                <Button onClick={saveAndOpen}>Save & open</Button>
              )}
            </div>
            {summary && (
              <pre className="border rounded p-3 text-sm whitespace-pre-wrap bg-slate-50 max-h-96 overflow-auto">{summary}</pre>
            )}
            {summaryError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{summaryError}</div>
            )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
