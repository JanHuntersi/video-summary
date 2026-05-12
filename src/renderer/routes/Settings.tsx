import { useEffect, useState } from 'react';
import { useSettings } from '@renderer/stores/settings';
import { Button } from '@renderer/components/ui/button';

export default function SettingsPage() {
  const { settings, load, save } = useSettings();
  const [keyInput, setKeyInput] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<string>('');
  const [geminiStatus, setGeminiStatus] = useState<string>('');

  useEffect(() => { void load(); }, []);
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
    </div>
  );
}

type AppSettingsWhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large';
