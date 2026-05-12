import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { useSettings } from '@renderer/stores/settings';
import { useLlmStream } from '@renderer/hooks/useIpcStream';
import type { ChatHistory, ChatMessage, LlmProviderId, TranscriptSegment } from '@shared/types';

interface Props {
  videoId: string;
  transcript: TranscriptSegment[] | null;
  summary: string | null;
  initialChat: ChatHistory | null;
  onSave: (h: ChatHistory) => void;
}

export function ChatPanel({ videoId, transcript, summary, initialChat, onSave }: Props) {
  const { settings } = useSettings();
  const [providerId, setProviderId] = useState<LlmProviderId>('ollama');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat?.messages ?? []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [activeReq, setActiveReq] = useState<string | null>(null);
  const assistantBufRef = useRef('');

  useEffect(() => { setMessages(initialChat?.messages ?? []); }, [initialChat]);
  useEffect(() => {
    window.api.llm.listModels(providerId).then(setModels).catch(() => setModels([]));
  }, [providerId]);

  useLlmStream(c => {
    if (c.requestId !== activeReq) return;
    if (c.error) {
      setMessages(prev => [...prev.slice(0, -1), { ...prev[prev.length-1], content: prev[prev.length-1].content + `\n[Error: ${c.error}]` }]);
      setStreaming(false);
      return;
    }
    if (c.done) {
      const next = [...messages];
      const final: ChatMessage = { role: 'assistant', content: assistantBufRef.current, createdAt: new Date().toISOString() };
      const merged = [...next, final];
      setMessages(merged);
      onSave({ messages: merged, systemPromptUsed: settings?.prompts.chat ?? '' });
      assistantBufRef.current = '';
      setStreaming(false);
      return;
    }
    assistantBufRef.current += c.token;
    // Render streaming token by mutating a pseudo last-assistant entry
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.createdAt === '__streaming__') {
        return [...prev.slice(0, -1), { ...last, content: last.content + c.token }];
      }
      return [...prev, { role: 'assistant', content: c.token, createdAt: '__streaming__' }];
    });
  });

  const send = async () => {
    if (!input.trim() || !model || !settings || !transcript) return;
    const userMsg: ChatMessage = { role: 'user', content: input, createdAt: new Date().toISOString() };
    const history = messages.filter(m => m.createdAt !== '__streaming__');
    setMessages([...history, userMsg]);
    setInput('');
    assistantBufRef.current = '';
    setStreaming(true);
    const transcriptText = transcript.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    const reqId = await window.api.llm.chat({
      providerId, model, history, userMessage: userMsg.content,
      systemPrompt: settings.prompts.chat, transcript: transcriptText, summary
    });
    setActiveReq(reqId);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b flex gap-2 text-sm">
        <select value={providerId} onChange={e => setProviderId(e.target.value as LlmProviderId)} className="border rounded px-2 py-1">
          <option value="ollama">Ollama</option>
          {settings?.gemini.hasKey && <option value="gemini">Gemini</option>}
        </select>
        <select value={model} onChange={e => setModel(e.target.value)} className="border rounded px-2 py-1 flex-1">
          <option value="">— model —</option>
          {models.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>{m.content}</div>
          </div>
        ))}
      </div>
      <div className="border-t p-2 flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
               disabled={streaming}
               placeholder="Ask about this video…"
               className="flex-1 border rounded px-2 py-1 text-sm"/>
        <Button onClick={send} disabled={streaming || !input.trim() || !model}>{streaming ? '…' : 'Send'}</Button>
      </div>
    </div>
  );
}
