import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en',   label: 'English' },
  { code: 'sl',   label: 'Slovenian' },
  { code: 'de',   label: 'German' },
  { code: 'fr',   label: 'French' },
  { code: 'es',   label: 'Spanish' },
  { code: 'it',   label: 'Italian' },
  { code: 'hr',   label: 'Croatian' },
  { code: 'sr',   label: 'Serbian' },
  { code: 'pt',   label: 'Portuguese' },
  { code: 'nl',   label: 'Dutch' },
  { code: 'pl',   label: 'Polish' },
  { code: 'ru',   label: 'Russian' }
];

const MODELS = ['tiny', 'base', 'small', 'medium', 'large'] as const;
export type WhisperModel = typeof MODELS[number];

// Languages whisper.cpp frequently confuses with neighbours on small models.
const LOW_RESOURCE_LANGS = new Set(['sl', 'hr', 'sr', 'bs', 'mk']);

interface Props {
  mode: 'transcribe' | 're-transcribe';
  defaultModel: WhisperModel;
  defaultLanguage?: string;
  onCancel: () => void;
  onStart: (args: { model: WhisperModel; language: string }) => void;
}

export function TranscribeDialog({ mode, defaultModel, defaultLanguage, onCancel, onStart }: Props) {
  const [model, setModel] = useState<WhisperModel>(defaultModel);
  const [language, setLanguage] = useState<string>(defaultLanguage ?? 'auto');
  const ref = useRef<HTMLDivElement>(null);

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        ref={ref}
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw] p-5"
      >
        <h2 className="text-lg font-semibold mb-1">
          {mode === 'transcribe' ? 'Transcribe video' : 'Re-transcribe video'}
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          {mode === 're-transcribe'
            ? 'This will overwrite the existing transcript.'
            : 'Run Whisper on the audio track.'}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Language</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label} ({l.code})</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Pick the spoken language for best accuracy; <i>Auto-detect</i> works but is slower and less reliable on short clips.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Whisper model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value as WhisperModel)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              <code>tiny</code> ≈ 75 MB, fastest, lowest quality · <code>base</code> ≈ 140 MB, good default · <code>small</code> ≈ 480 MB · <code>medium</code> ≈ 1.5 GB · <code>large</code> ≈ 3 GB, slowest, best.
            </p>
            {LOW_RESOURCE_LANGS.has(language) && (model === 'tiny' || model === 'base' || model === 'small') && (
              <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded px-2 py-1.5">
                ⚠️ Whisper often confuses <b>{LANGUAGES.find(l => l.code === language)?.label}</b> with its South-Slavic neighbours on smaller models (you may get Croatian output for Slovenian input, etc.). For best accuracy, use <code>medium</code> or <code>large</code>.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={() => onStart({ model, language })}>
            {mode === 'transcribe' ? 'Start' : 'Re-transcribe'}
          </Button>
        </div>
      </div>
    </div>
  );
}
