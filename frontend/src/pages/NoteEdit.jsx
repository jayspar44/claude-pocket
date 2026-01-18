import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { api } from '../api/services';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { logger } from '../utils/logger';

export default function NoteEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isNew) {
      loadNote();
    }
  }, [id]);

  const loadNote = async () => {
    try {
      setLoading(true);
      setError(null);
      const note = await api.getNote(id);
      setTitle(note.title);
      setContent(note.content || '');
    } catch (err) {
      logger.error('Failed to load note', err);
      setError('Failed to load note');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (isNew) {
        await api.createNote({ title: title.trim(), content });
      } else {
        await api.updateNote(id, { title: title.trim(), content });
      }

      navigate('/notes');
    } catch (err) {
      logger.error('Failed to save note', err);
      setError('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      setSaving(true);
      await api.deleteNote(id);
      navigate('/notes');
    } catch (err) {
      logger.error('Failed to delete note', err);
      setError('Failed to delete note');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-4 space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-slate-200 rounded-lg dark:bg-slate-700" />
          <div className="h-40 bg-slate-200 rounded-lg dark:bg-slate-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/notes')}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button
              variant="outline"
              onClick={handleDelete}
              disabled={saving}
              className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim()}
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
        </Card>
      )}

      {/* Form */}
      <Card className="p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter note title..."
            className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:placeholder-slate-400"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-300">
            Content
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note here..."
            rows={10}
            className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none transition-all resize-none dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200 dark:placeholder-slate-400"
          />
        </div>
      </Card>
    </div>
  );
}
