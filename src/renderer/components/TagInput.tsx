import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@renderer/lib/cn';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

export function TagInput({ value, onChange, suggestions = [], placeholder = 'Add tag…' }: Props) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const needle = input.trim().toLowerCase();
    const taken = new Set(value.map(v => v.toLowerCase()));
    return suggestions
      .filter(s => !taken.has(s.toLowerCase()))
      .filter(s => !needle || s.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [suggestions, value, input]);

  const exactExists = useMemo(() => {
    const n = input.trim().toLowerCase();
    if (!n) return true;
    return value.map(v => v.toLowerCase()).includes(n)
      || filtered.some(s => s.toLowerCase() === n);
  }, [input, value, filtered]);

  useEffect(() => { setHighlight(0); }, [input]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (value.map(v => v.toLowerCase()).includes(t.toLowerCase())) {
      setInput('');
      return;
    }
    onChange([...value, t]);
    setInput('');
  };

  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const options = [
    ...filtered.map(s => ({ kind: 'existing' as const, value: s })),
    ...(input.trim() && !exactExists ? [{ kind: 'create' as const, value: input.trim() }] : [])
  ];

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      if (options[highlight]) {
        e.preventDefault();
        addTag(options[highlight].value);
      } else if (input.trim()) {
        e.preventDefault();
        addTag(input);
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeAt(value.length - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, Math.max(0, options.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setFocused(false);
    }
  };

  const showDropdown = focused && options.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className="border rounded px-1.5 py-1 flex flex-wrap items-center gap-1 min-h-[34px] bg-white focus-within:ring-2 focus-within:ring-slate-300"
      >
        {value.map((t, i) => (
          <span key={`${t}-${i}`} className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 rounded-full text-xs px-2 py-0.5">
            {t}
            <button type="button" onClick={() => removeAt(i)} className="hover:text-red-600">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={onKey}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[100px] outline-none text-sm px-1 py-0.5"
        />
      </div>

      {showDropdown && (
        <div className="absolute z-10 mt-1 left-0 right-0 bg-white border rounded shadow max-h-56 overflow-auto">
          {options.map((opt, i) => (
            <button
              key={`${opt.kind}-${opt.value}-${i}`}
              type="button"
              onMouseDown={e => { e.preventDefault(); addTag(opt.value); }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between',
                highlight === i ? 'bg-slate-100' : 'hover:bg-slate-50'
              )}
            >
              <span>{opt.value}</span>
              <span className="text-xs text-slate-400">
                {opt.kind === 'existing' ? 'add' : 'create'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
