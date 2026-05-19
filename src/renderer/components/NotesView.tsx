import { useEffect, useRef, useState } from 'react';
import { Pencil, Save, X } from 'lucide-react';
import { Button } from './ui/button';
import { MarkdownWithTimestamps } from './MarkdownWithTimestamps';
import { toast } from './Toast';

interface Props {
  videoId: string;
  onSeek?: (sec: number) => void;
}

export function NotesView({ videoId, onSeek }: Props) {
  const [text, setText] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const reload = async () => {
    const content = await window.api.library.readNotes(videoId);
    setText(content);
    setLoaded(true);
  };

  useEffect(() => { void reload(); }, [videoId]);

  // Refresh when window regains focus — picks up appends from "Save to notes" button in Chat.
  useEffect(() => {
    const onFocus = () => { if (!editing) void reload(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [editing, videoId]);

  // Also refresh on a custom event so ChatPanel can ping us after appending.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ videoId: string }>).detail;
      if (detail?.videoId === videoId && !editing) void reload();
    };
    window.addEventListener('notes:changed', handler as EventListener);
    return () => window.removeEventListener('notes:changed', handler as EventListener);
  }, [editing, videoId]);

  const startEdit = () => {
    setDraft(text);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const cancel = () => {
    setEditing(false);
    setDraft('');
  };

  const save = async () => {
    try {
      await window.api.library.writeNotes(videoId, draft);
      setText(draft);
      setEditing(false);
      toast.success('Notes saved');
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  };

  if (!loaded) return <div className="p-3 text-sm text-slate-500">Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end gap-2 p-2 border-b">
        {editing ? (
          <>
            <Button variant="outline" onClick={cancel} className="gap-1.5">
              <X size={14} /> Cancel
            </Button>
            <Button onClick={save} className="gap-1.5">
              <Save size={14} /> Save
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={startEdit} className="gap-1.5">
            <Pencil size={14} /> Edit
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write notes in markdown… use [HH:MM:SS] to embed clickable timestamps."
            className="w-full h-full p-3 font-mono text-sm resize-none focus:outline-none"
          />
        ) : text.trim() ? (
          <div className="p-3">
            <MarkdownWithTimestamps text={text} onSeek={onSeek} />
          </div>
        ) : (
          <div className="p-3 text-sm text-slate-500">
            No notes yet. Click <b>Edit</b> to start, or use <b>📌 Save to notes</b> on a chat message.
          </div>
        )}
      </div>
    </div>
  );
}
