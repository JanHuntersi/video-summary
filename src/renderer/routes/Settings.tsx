import { useEffect, useState } from 'react';
import { useSettings } from '@renderer/stores/settings';
import { Button } from '@renderer/components/ui/button';
import type { LlmProviderId } from '@shared/types';
import { toast } from '@renderer/components/Toast';

export default function SettingsPage() {
  const { settings, load, save, checkGeminiKey } = useSettings();
  const [keyInput, setKeyInput] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<string>('');
  const [geminiStatus, setGeminiStatus] = useState<string>('');
  const [wfModels, setWfModels] = useState<string[]>([]);
  const [version, setVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<string>('');

  useEffect(() => {
    void (async () => {
      await load();
      // Probe keychain ONLY when the Settings page is open. Users who never visit
      // Settings (e.g. Ollama-only workflows) won't trigger the macOS auth prompt
      // for the unsigned app.
      await checkGeminiKey().catch(() => { /* user denied or no key; that's fine */ });
    })();
    void window.api.system.getVersion().then(setVersion).catch(() => {});
  }, []);

  const checkForUpdates = async () => {
    setUpdateStatus('Checking…');
    try {
      const r = await window.api.system.checkLatest(true);
      if (r.error) setUpdateStatus(`Error: ${r.error}`);
      else if (r.isNewer && r.latest) setUpdateStatus(`Update available: v${r.latest}`);
      else if (r.latest) setUpdateStatus(`You're on the latest version (v${r.latest})`);
      else setUpdateStatus('No release info available');
    } catch (e) {
      setUpdateStatus(`Error: ${(e as Error).message}`);
    }
  };

  useEffect(() => {
    if (!settings) return;
    const prov = settings.defaultLlm?.providerId ?? 'ollama';
    window.api.llm.listModels(prov)
      .then(setWfModels)
      .catch(() => setWfModels([]));
  }, [settings?.defaultLlm?.providerId]);

  if (!settings) return <div className="p-4">Loading…</div>;

  const pickLibrary = async () => {
    const f = await window.api.library.pickFolder();
    if (f) await save({ libraryPath: f });
  };
  const testOllama = async () => {
    const r = await window.api.llm.testConnection('ollama');
    setOllamaStatus(r.ok ? `OK — ${r.detail}` : `Error: ${r.detail}`);
  };
  const testGemini = async () => {
    const r = await window.api.llm.testConnection('gemini');
    setGeminiStatus(r.ok ? `OK — ${r.detail}` : `Error: ${r.detail}`);
  };
  const saveGeminiKey = async () => {
    await window.api.settings.setGeminiKey(keyInput);
    await load();
    setKeyInput('');
  };

  const changeWfProvider = async (providerId: LlmProviderId) => {
    await save({ defaultLlm: { providerId, model: '' } });
  };
  const changeWfModel = async (model: string) => {
    const providerId = settings.defaultLlm?.providerId ?? 'ollama';
    await save({ defaultLlm: { providerId, model } });
    if (model) toast.success('Default LLM saved');
  };

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <section>
        <h2 className="text-lg font-semibold mb-2">Library</h2>
        <div className="flex items-center gap-3">
          <code className="text-sm bg-slate-100 px-2 py-1 rounded">{settings.libraryPath}</code>
          <Button variant="outline" onClick={pickLibrary}>Change folder…</Button>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm">
          <input type="checkbox" checked={settings.importMode === 'move'}
                 onChange={e => save({ importMode: e.target.checked ? 'move' : 'copy' })}/>
          Move file on import (default: copy)
        </label>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Transcription</h2>
        <label className="text-sm">Default Whisper model:&nbsp;
          <select value={settings.whisper.defaultModel}
                  onChange={e => save({ whisper: { ...settings.whisper, defaultModel: e.target.value as AppSettingsWhisperModel }})}
                  className="border rounded px-2 py-1">
            {(['tiny','base','small','medium','large'] as const).map(m => <option key={m}>{m}</option>)}
          </select>
        </label>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Workflow automation</h2>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!settings.autoTranscribe}
                   onChange={e => save({ autoTranscribe: e.target.checked })}/>
            Auto-start transcription after import
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!settings.autoSummarize}
                   onChange={e => save({ autoSummarize: e.target.checked })}/>
            Auto-generate summary after transcription
          </label>
        </div>
        <div className="mt-3">
          <div className="text-sm font-medium mb-1">Default LLM for auto-summary &amp; quick actions</div>
          <div className="flex flex-wrap gap-3 text-sm items-center">
            <label>Provider&nbsp;
              <select
                value={settings.defaultLlm?.providerId ?? 'ollama'}
                onChange={e => changeWfProvider(e.target.value as LlmProviderId)}
                className="border rounded px-2 py-1">
                <option value="ollama">Ollama</option>
                {settings.gemini.hasKey && <option value="gemini">Gemini</option>}
              </select>
            </label>
            <label>Model&nbsp;
              <select
                value={settings.defaultLlm?.model ?? ''}
                onChange={e => changeWfModel(e.target.value)}
                className="border rounded px-2 py-1">
                <option value="">— select —</option>
                {wfModels.map(m => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Ollama</h2>
        <input className="border rounded px-2 py-1 text-sm w-96" value={settings.ollama.baseUrl}
               onChange={e => save({ ollama: { baseUrl: e.target.value }})}/>
        <Button variant="outline" className="ml-2" onClick={testOllama}>Test connection</Button>
        <div className="text-sm mt-1 text-slate-600">{ollamaStatus}</div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Google Gemini</h2>
        <div className="flex gap-2">
          <input type="password" placeholder={settings.gemini.hasKey ? '••••••••' : 'API key'}
                 value={keyInput} onChange={e => setKeyInput(e.target.value)}
                 className="border rounded px-2 py-1 text-sm w-96"/>
          <Button variant="outline" onClick={saveGeminiKey} disabled={!keyInput}>Save key</Button>
          {settings.gemini.hasKey && <Button variant="ghost" onClick={async () => { await window.api.settings.clearGeminiKey(); await load(); }}>Clear</Button>}
          <Button variant="outline" onClick={testGemini} disabled={!settings.gemini.hasKey}>Test</Button>
        </div>
        <div className="text-sm mt-1 text-slate-600">{geminiStatus}</div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Prompts</h2>
        <label className="block text-sm font-medium mb-1">Summary system prompt</label>
        <textarea className="w-full border rounded p-2 text-sm h-32"
                  value={settings.prompts.summary}
                  onChange={e => save({ prompts: { ...settings.prompts, summary: e.target.value } })}/>
        <label className="block text-sm font-medium mb-1 mt-3">Chat system prompt</label>
        <textarea className="w-full border rounded p-2 text-sm h-32"
                  value={settings.prompts.chat}
                  onChange={e => save({ prompts: { ...settings.prompts, chat: e.target.value } })}/>
      </section>

      <section className="border-t pt-4">
        <h2 className="text-lg font-semibold mb-2">About</h2>
        <div className="text-sm space-y-1">
          <div>
            <span className="text-slate-600">Version:</span>{' '}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded">{version || '…'}</code>
          </div>
          <div>
            <span className="text-slate-600">Repository:</span>{' '}
            <button
              onClick={() => window.api.system.openExternal('https://github.com/JanHuntersi/video-summary')}
              className="text-blue-600 hover:underline"
            >
              github.com/JanHuntersi/video-summary
            </button>
          </div>
          <div>
            <span className="text-slate-600">Releases:</span>{' '}
            <button
              onClick={() => window.api.system.openExternal('https://github.com/JanHuntersi/video-summary/releases')}
              className="text-blue-600 hover:underline"
            >
              View all releases
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Button variant="outline" onClick={checkForUpdates}>Check for updates</Button>
          {updateStatus && <span className="text-sm text-slate-600">{updateStatus}</span>}
        </div>
      </section>
    </div>
  );
}

type AppSettingsWhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large';
