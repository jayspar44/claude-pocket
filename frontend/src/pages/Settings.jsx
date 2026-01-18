import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { LogOut, Moon, Sun, User, Wrench, Info, ChevronRight, Check } from 'lucide-react';
import { getVersionString, getEnvironment, getBackendInfo } from '../utils/appConfig';

export default function Settings() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { isDark, toggleTheme } = useTheme();
    const { firstName, saveFirstName, developerMode, setDeveloperMode } = useUserPreferences();

    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState(firstName);
    const [savingName, setSavingName] = useState(false);

    const handleLogout = async () => {
        if (confirm('Are you sure you want to sign out?')) {
            await logout();
            navigate('/login');
        }
    };

    const handleSaveName = async () => {
        if (!nameInput.trim()) return;
        setSavingName(true);
        try {
            await saveFirstName(nameInput.trim());
            setEditingName(false);
        } catch {
            alert('Failed to save name');
        }
        setSavingName(false);
    };

    const backendInfo = getBackendInfo();
    const environment = getEnvironment();

    return (
        <div className="px-6 py-4 space-y-6">
            {/* Profile Section */}
            <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 dark:text-slate-400">
                    Profile
                </h3>

                {/* Name */}
                <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-slate-400" />
                        <span className="text-slate-700 dark:text-slate-300">Name</span>
                    </div>
                    {editingName ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                className="w-32 px-2 py-1 text-sm border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200"
                                autoFocus
                            />
                            <Button
                                size="sm"
                                onClick={handleSaveName}
                                disabled={savingName}
                            >
                                <Check className="w-4 h-4" />
                            </Button>
                        </div>
                    ) : (
                        <button
                            onClick={() => {
                                setNameInput(firstName);
                                setEditingName(true);
                            }}
                            className="flex items-center gap-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        >
                            <span>{firstName || 'Not set'}</span>
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Email */}
                <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                        <Info className="w-5 h-5 text-slate-400" />
                        <span className="text-slate-700 dark:text-slate-300">Email</span>
                    </div>
                    <span className="text-slate-500 dark:text-slate-400">{user?.email}</span>
                </div>
            </Card>

            {/* Appearance */}
            <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 dark:text-slate-400">
                    Appearance
                </h3>

                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between py-3"
                >
                    <div className="flex items-center gap-3">
                        {isDark ? (
                            <Moon className="w-5 h-5 text-slate-400" />
                        ) : (
                            <Sun className="w-5 h-5 text-slate-400" />
                        )}
                        <span className="text-slate-700 dark:text-slate-300">Dark Mode</span>
                    </div>
                    <div className={`w-12 h-6 rounded-full p-1 transition-colors ${isDark ? 'bg-sky-500' : 'bg-slate-200'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-6' : ''}`} />
                    </div>
                </button>
            </Card>

            {/* Developer Options */}
            <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 dark:text-slate-400">
                    Developer
                </h3>

                <button
                    onClick={() => setDeveloperMode(!developerMode)}
                    className="w-full flex items-center justify-between py-3"
                >
                    <div className="flex items-center gap-3">
                        <Wrench className="w-5 h-5 text-slate-400" />
                        <span className="text-slate-700 dark:text-slate-300">Developer Mode</span>
                    </div>
                    <div className={`w-12 h-6 rounded-full p-1 transition-colors ${developerMode ? 'bg-amber-500' : 'bg-slate-200'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${developerMode ? 'translate-x-6' : ''}`} />
                    </div>
                </button>
            </Card>

            {/* App Info */}
            <Card className="p-4">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 dark:text-slate-400">
                    About
                </h3>

                <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Version</span>
                        <span className="text-slate-700 dark:text-slate-300">{getVersionString()}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500 dark:text-slate-400">Environment</span>
                        <span className="text-slate-700 dark:text-slate-300">{environment}</span>
                    </div>
                    {backendInfo && (
                        <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Backend Version</span>
                            <span className="text-slate-700 dark:text-slate-300">v{backendInfo.version}</span>
                        </div>
                    )}
                </div>
            </Card>

            {/* Sign Out */}
            <Button
                variant="outline"
                className="w-full text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                onClick={handleLogout}
            >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
            </Button>
        </div>
    );
}
