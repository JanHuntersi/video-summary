import { useEffect, useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { TagInput } from './TagInput';
import { useLibrary } from '@renderer/stores/library';
import type { VideoMeta } from '@shared/types';

interface Props {
  meta: VideoMeta;
  onClose: () => void;
  onSave: (patch: Partial<VideoMeta>) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function EditDetailsModal({ meta, onClose, onSave, onDelete }: Props) {
  const { videos } = useLibrary();
  const [title, setTitle] = useState(meta.title);
  const [tags, setTags] = useState<string[]>(meta.tags ?? []);
  const [notes, setNotes] = useState(meta.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    videos.forEach(v => (v.tags ?? []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [videos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ title: title.trim() || meta.title, tags, notes });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Edit video details</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900"><X size={18} /></button>
        </div>

        <label className="block text-sm">
          <span className="font-medium">Title</span>
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
                 className="mt-1 block w-full border rounded px-2 py-1.5" />
        </label>

        <div className="block text-sm">
          <div className="font-medium mb-1">Tags</div>
          <TagInput
            value={tags}
            onChange={setTags}
            suggestions={tagSuggestions}
            placeholder="Type to search or create a tag…"
          />
          <div className="text-xs text-slate-500 mt-1">Enter / comma adds. Backspace removes the last one.</div>
        </div>

        <label className="block text-sm">
          <span className="font-medium">Notes</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5}
                    className="mt-1 block w-full border rounded px-2 py-1.5" />
        </label>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          {!confirmDelete ? (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-red-600 hover:bg-red-50 gap-1.5">
              <Trash2 size={14} /> Delete video
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-red-700">Delete permanently?</span>
              <button onClick={async () => { setDeleting(true); try { await onDelete(); } finally { setDeleting(false); } }}
                      disabled={deleting}
                      className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-600 underline">Cancel</button>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
