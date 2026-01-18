import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/services';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { logger } from '../utils/logger';

export default function Notes() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getNotes();
      setNotes(data);
    } catch (err) {
      logger.error('Failed to load notes', err);
      setError('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e, noteId) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      await api.deleteNote(noteId);
      setNotes(notes.filter(n => n.id !== noteId));
    } catch (err) {
      logger.error('Failed to delete note', err);
      alert('Failed to delete note');
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="px-6 py-4 space-y-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-slate-200 rounded-xl dark:bg-slate-700" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200">
          My Notes
        </h2>
        <Button
          onClick={() => navigate('/notes/new')}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New
        </Button>
      </div>

      {error && (
        <Card className="p-4 bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          {error}
          <button onClick={loadNotes} className="underline ml-2">Retry</button>
        </Card>
      )}

      {/* Notes List */}
      {notes.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4 dark:text-slate-600" />
          <h3 className="font-semibold text-slate-600 mb-2 dark:text-slate-400">No notes yet</h3>
          <p className="text-sm text-slate-500 mb-4 dark:text-slate-500">
            Create your first note to get started.
          </p>
          <Button onClick={() => navigate('/notes/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Create Note
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <Card
              key={note.id}
              className="p-4 cursor-pointer hover:bg-slate-50 transition-colors dark:hover:bg-slate-700"
              onClick={() => navigate(`/notes/${note.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-800 truncate dark:text-slate-200">
                    {note.title}
                  </h3>
                  {note.content && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2 dark:text-slate-400">
                      {note.content}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-2 dark:text-slate-500">
                    {formatDate(note.updatedAt)}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, note.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
