import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Settings } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="px-6 py-4 space-y-6">
      {/* Welcome Section */}
      <Card className="p-6 bg-gradient-to-br from-sky-500 to-blue-600 text-white">
        <h2 className="text-2xl font-bold mb-2">Welcome!</h2>
        <p className="opacity-90">
          This is your app dashboard. Start by creating your first note.
        </p>
      </Card>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Quick Actions</h3>

        <button
          onClick={() => navigate('/notes/new')}
          className="w-full flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
        >
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center dark:bg-green-900/30">
            <Plus className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Create Note</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Add a new note</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/notes')}
          className="w-full flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center dark:bg-blue-900/30">
            <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-slate-800 dark:text-slate-200">View Notes</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Browse all your notes</p>
          </div>
        </button>

        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
        >
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center dark:bg-slate-700">
            <Settings className="w-6 h-6 text-slate-600 dark:text-slate-400" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Settings</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">Configure your app</p>
          </div>
        </button>
      </div>

      {/* Getting Started */}
      <Card className="p-4">
        <h3 className="font-semibold text-slate-800 mb-2 dark:text-slate-200">Getting Started</h3>
        <ul className="text-sm text-slate-600 space-y-2 dark:text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-green-500">✓</span>
            <span>You're logged in!</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-300 dark:text-slate-600">○</span>
            <span>Create your first note</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-300 dark:text-slate-600">○</span>
            <span>Explore the settings</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
