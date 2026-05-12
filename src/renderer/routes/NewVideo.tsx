import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@renderer/components/ui/button';
import { useSettings } from '@renderer/stores/settings';
import { useLlmStream, useTranscriptionEvents } from '@renderer/hooks/useIpcStream';
import type { LlmProviderId, VideoMeta } from '@shared/types';

type Step = 1 | 2 | 3;

export default function NewVideo() {
  const nav = useNavigate();
  const { settings, load } = useSettings();
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [importing, setImporting] = useState(false);
  const [meta, setMeta] = useState<VideoMeta | null>(null);

  // Step 2 state
  const [model, setModel] = useState<'tiny' | 'base' | 'small' | 'medium' | 'large'>('base');
  const [language, setLanguage] = useState('auto');
  const [transcribing, setTranscribing] = useState(false);
  const [progressText, setProgressText] = useState('');

  // Step 3 state
  const [providerId, setProviderId] = useState<LlmProviderId>('ollama');
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [llmModel, setLlmModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [activeReq, setActiveReq] = useState<string | null>(null);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (settings) {
      setModel(settings.whisper.defaultModel);
      setSystemPrompt(settings.prompts.summary);
    }
  }, [settings]);
  useEffect(() => {
    if (step === 3) {
      window.api.llm.listModels(providerId).then(setLlmModels).catch(() => setLlmModels([]));
    }
  }, [step, providerId]);

  useTranscriptionEvents({
    onProgress: p => { if (meta && p.videoId === meta.id) setProgressText(p.partialText); },
    onDone: async p => {
      if (!meta || p.videoId !== meta.id) return;
      setTranscribing(false);
      const updated = await window.api.library.getMeta(meta.id);
      setMeta(updated);
    },
    onError: p => {
      if (meta && p.videoId === meta.id) {
        setTranscribing(false);
        setProgressText(`Error: ${p.message}`);
      }
    }
  });

  useLlmStream(c => {
    if (c.requestId !== activeReq) return;
    if (c.error) { setSummary(prev => prev + `\n\n[Error: ${c.error}]`); setSummarizing(false); return; }
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
      setStep(2);
    } finally { setImporting(false); }
  };

  const runTranscribe = async () => {
    if (!meta) return;
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
    setSummarizing(true);
    const reqId = await window.api.llm.summarize({ providerId, model: llmModel, transcript: transcriptText, systemPrompt });
    setActiveReq(reqId);
  };

  const saveAndOpen = async () => {
    if (!meta) return;
    await window.api.library.writeSummary(meta.id, summary);
    await window.api.library.updateMeta(meta.id, {
      status: 'summarized',
      summary: { provider: providerId, model: llmModel, systemPrompt, generatedAt: new Date().toISOString() }
    });
    nav(`/video/${meta.id}`);
  };

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(n => <div key={n} className={`flex-1 h-2 rounded ${step >= n ? 'bg-slate-900' : 'bg-slate-200'}`} />)}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Step 1 — Import</h2>
            <Button variant="outline" onClick={pickFile}>Choose video file…</Button>
            {sourcePath && <>
              <div className="text-sm text-slate-600">Selected: {sourcePath}</div>
              <label className="block text-sm">Title:&nbsp;
                <input value={title} onChange={e => setTitle(e.target.value)} className="border rounded px-2 py-1 w-80" />
              </label>
              <Button onClick={runImport} disabled={importing || !title}>{importing ? 'Importing…' : 'Import & continue'}</Button>
            </>}
          </div>
        )}

        {step === 2 && meta && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Step 2 — Transcribe</h2>
            <label className="block text-sm">Model:&nbsp;
              <select value={model} onChange={e => setModel(e.target.value as 'tiny' | 'base' | 'small' | 'medium' | 'large')} className="border rounded px-2 py-1">
                {['tiny', 'base', 'small', 'medium', 'large'].map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label className="block text-sm">Language:&nbsp;
              <select value={language} onChange={e => setLanguage(e.target.value)} className="border rounded px-2 py-1">
                <option value="auto">auto</option>
                {['en', 'sl', 'de', 'fr', 'es', 'it'].map(l => <option key={l}>{l}</option>)}
              </select>
            </label>
            {!transcribing && meta.status !== 'transcribed' && meta.status !== 'summarized' && <Button onClick={runTranscribe}>Start transcription</Button>}
            {transcribing && <div className="text-sm text-slate-600">{progressText}</div>}
            {(meta.status === 'transcribed' || meta.status === 'summarized') && (
              <>
                <div className="text-green-700 text-sm">Transcription complete.</div>
                <Button onClick={() => setStep(3)}>Next</Button>
              </>
            )}
          </div>
        )}

        {step === 3 && meta && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Step 3 — Summarize (optional)</h2>
            <div className="flex gap-3">
              <label className="text-sm">Provider:&nbsp;
                <select value={providerId} onChange={e => setProviderId(e.target.value as LlmProviderId)} className="border rounded px-2 py-1">
                  <option value="ollama">Ollama</option>
                  {settings?.gemini.hasKey && <option value="gemini">Gemini</option>}
                </select>
              </label>
              <label className="text-sm">Model:&nbsp;
                <select value={llmModel} onChange={e => setLlmModel(e.target.value)} className="border rounded px-2 py-1">
                  <option value="">— select —</option>
                  {llmModels.map(m => <option key={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-sm">System prompt:</label>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} className="w-full border rounded p-2 text-sm h-28" />
            <div className="flex gap-2">
              <Button onClick={runSummarize} disabled={summarizing || !llmModel}>Generate summary</Button>
              <Button variant="outline" onClick={() => nav(`/video/${meta.id}`)}>Skip</Button>
            </div>
            {summary && <pre className="border rounded p-3 text-sm whitespace-pre-wrap bg-slate-50">{summary}</pre>}
            {summary && !summarizing && <Button onClick={saveAndOpen}>Save & open</Button>}
          </div>
        )}
      </div>
    </div>
  );
}
