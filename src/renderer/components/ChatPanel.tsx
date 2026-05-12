import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { useSettings } from '@renderer/stores/settings';
import { useLlmStream } from '@renderer/hooks/useIpcStream';
import { toast } from './Toast';
import type { ChatMessage, ChatRecord, ChatSummary, LlmProviderId, TranscriptSegment } from '@shared/types';

interface Props {
  videoId: string;
  transcript: TranscriptSegment[] | null;
  summary: string | null;
}

export function ChatPanel({ videoId, transcript, summary }: Props) {
  const { settings } = useSettings();
  const [providerId, setProviderId] = useState<LlmProviderId>('ollama');
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [active, setActive] = useState<ChatRecord | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [activeReq, setActiveReq] = useState<string | null>(null);
  const [streamBuf, setStreamBuf] = useState('');
  const streamBufRef = useRef('');

  // Load chats on video change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await window.api.library.listChats(videoId);
      if (cancelled) return;
      setChats(list);
      if (list.length > 0) {
        setActiveChatId(list[0].id);
      } else {
        const fresh = await window.api.library.createChat(videoId);
        if (cancelled) return;
        setChats([{ id: fresh.id, title: fresh.title, createdAt: fresh.createdAt, lastMessageAt: fresh.lastMessageAt, messageCount: 0 }]);
        setActiveChatId(fresh.id);
      }
    })();
    return () => { cancelled = true; };
  }, [videoId]);

  // Load active chat record
  useEffect(() => {
    if (!activeChatId) { setActive(null); return; }
    let cancelled = false;
    window.api.library.readChatById(videoId, activeChatId).then(r => {
      if (!cancelled) setActive(r);
    });
    return () => { cancelled = true; };
  }, [videoId, activeChatId]);

  // Load LLM models
  useEffect(() => {
    window.api.llm.listModels(providerId)
      .then(setModels)
      .catch(e => {
        setModels([]);
        toast.error(`${providerId === 'ollama' ? 'Ollama' : 'Gemini'} unreachable: ${(e as Error).message}`);
      });
  }, [providerId]);

  useLlmStream(c => {
    if (c.requestId !== activeReq) return;
    if (c.error) {
      toast.error(`Chat failed: ${c.error}`);
      setStreaming(false);
      return;
    }
    if (c.done) {
      void finalizeStream();
      return;
    }
    streamBufRef.current += c.token;
    setStreamBuf(streamBufRef.current);
  });

  const finalizeStream = async () => {
    if (!active) { setStreaming(false); return; }
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: streamBufRef.current,
      createdAt: new Date().toISOString()
    };
    const updated: ChatRecord = {
      ...active,
      messages: [...active.messages, assistantMsg],
      lastMessageAt: assistantMsg.createdAt
    };
    setActive(updated);
    await window.api.library.writeChatById(videoId, updated);
    // refresh summary in chat list
    setChats(prev => prev.map(c => c.id === updated.id
      ? { ...c, lastMessageAt: updated.lastMessageAt, messageCount: updated.messages.length }
      : c));
    streamBufRef.current = '';
    setStreamBuf('');
    setStreaming(false);
  };

  const send = async () => {
    if (!input.trim() || !model || !settings || !transcript || !active) return;
    const userMsg: ChatMessage = { role: 'user', content: input, createdAt: new Date().toISOString() };
    const history = active.messages;
    const updated: ChatRecord = {
      ...active,
      messages: [...history, userMsg],
      lastMessageAt: userMsg.createdAt
    };
    setActive(updated);
    await window.api.library.writeChatById(videoId, updated);
    setInput('');
    streamBufRef.current = '';
    setStreamBuf('');
    setStreaming(true);
    const transcriptText = transcript.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    try {
      const reqId = await window.api.llm.chat({
        providerId, model, history, userMessage: userMsg.content,
        systemPrompt: settings.prompts.chat, transcript: transcriptText, summary
      });
      setActiveReq(reqId);
    } catch (e) {
      toast.error(`Cannot start chat: ${(e as Error).message}`);
      setStreaming(false);
    }
  };

  const newChat = async () => {
    const rec = await window.api.library.createChat(videoId);
    setChats(prev => [{ id: rec.id, title: rec.title, createdAt: rec.createdAt, lastMessageAt: rec.lastMessageAt, messageCount: 0 }, ...prev]);
    setActiveChatId(rec.id);
  };

  const deleteActive = async () => {
    if (!activeChatId) return;
    if (!confirm('Delete this chat?')) return;
    await window.api.library.deleteChat(videoId, activeChatId);
    const remaining = chats.filter(c => c.id !== activeChatId);
    setChats(remaining);
    if (remaining.length > 0) {
      setActiveChatId(remaining[0].id);
    } else {
      const fresh = await window.api.library.createChat(videoId);
      setChats([{ id: fresh.id, title: fresh.title, createdAt: fresh.createdAt, lastMessageAt: fresh.lastMessageAt, messageCount: 0 }]);
      setActiveChatId(fresh.id);
    }
  };

  const startRename = () => {
    if (!active) return;
    setRenameValue(active.title);
    setRenaming(true);
  };

  const commitRename = async () => {
    if (!active) return;
    const title = renameValue.trim() || active.title;
    setRenaming(false);
    const updated = await window.api.library.renameChat(videoId, active.id, title);
    setActive(updated);
    setChats(prev => prev.map(c => c.id === updated.id ? { ...c, title: updated.title } : c));
  };

  const messagesToShow = active?.messages ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Chat selector header */}
      <div className="border-b p-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {renaming ? (
            <>
              <input value={renameValue} onChange={e => setRenameValue(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && commitRename()}
                     autoFocus
                     className="flex-1 border rounded px-2 py-1 text-sm" />
              <button onClick={commitRename} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={16} /></button>
              <button onClick={() => setRenaming(false)} className="p-1 text-slate-500 hover:bg-slate-100 rounded"><X size={16} /></button>
            </>
          ) : (
            <>
              <select value={activeChatId ?? ''} onChange={e => setActiveChatId(e.target.value)}
                      className="flex-1 border rounded px-2 py-1 text-sm">
                {chats.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.title} {c.messageCount > 0 ? `· ${c.messageCount} msgs` : ''}
                  </option>
                ))}
              </select>
              <button onClick={startRename} disabled={!active} title="Rename chat"
                      className="p-1.5 text-slate-600 hover:bg-slate-100 rounded disabled:opacity-50"><Pencil size={14} /></button>
              <button onClick={deleteActive} disabled={!activeChatId} title="Delete chat"
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"><Trash2 size={14} /></button>
              <button onClick={newChat} title="New chat"
                      className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"><Plus size={14} /></button>
            </>
          )}
        </div>
        <div className="flex gap-2 text-sm">
          <select value={providerId} onChange={e => setProviderId(e.target.value as LlmProviderId)}
                  className="border rounded px-2 py-1">
            <option value="ollama">Ollama</option>
            {settings?.gemini.hasKey && <option value="gemini">Gemini</option>}
          </select>
          <select value={model} onChange={e => setModel(e.target.value)} className="border rounded px-2 py-1 flex-1">
            <option value="">— model —</option>
            {models.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messagesToShow.length === 0 && !streaming && (
          <div className="text-sm text-slate-400 italic text-center mt-8">
            No messages yet. Ask something about this video.
          </div>
        )}
        {messagesToShow.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}>
              {m.content}
            </div>
          </div>
        ))}
        {streaming && (
          <div>
            <div className="inline-block max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap bg-slate-100">
              {streamBuf || <span className="text-slate-400">…</span>}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-2 flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
               disabled={streaming}
               placeholder="Ask about this video…"
               className="flex-1 border rounded px-2 py-1 text-sm" />
        <Button onClick={send} disabled={streaming || !input.trim() || !model}>
          {streaming ? '…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
