import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Settings, Zap } from 'lucide-react';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';
import { getVersionString, fetchBackendInfo, getBackendInfo, onHmrUpdate } from '../../utils/appConfig';

export const TopBar = () => {
    const { firstName, profileLoading } = useUserPreferences();
    const location = useLocation();
    const navigate = useNavigate();
    const [, forceUpdate] = useState(0);

    // Re-render when backend info loads or HMR updates (for live version string)
    useEffect(() => {
        if (!getBackendInfo()) {
            fetchBackendInfo().then(() => forceUpdate(n => n + 1));
        }
        // Subscribe to HMR updates to refresh timestamp
        return onHmrUpdate(() => forceUpdate(n => n + 1));
    }, []);

    const displayName = firstName || 'Friend';

    const isOnSettings = location.pathname === '/settings';

    const handleSettingsClick = (e) => {
        if (isOnSettings) {
            e.preventDefault();
            navigate(-1);
        }
    };

    return (
        <header
            className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 bg-surface/80 backdrop-blur-md z-40 dark:bg-slate-800/80"
            style={{
                paddingTop: 'calc(var(--safe-area-top, 0px) + 1rem)',
                paddingBottom: '1rem'
            }}
        >
            {/* Left: Logo and greeting */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-md">
                    <Zap className="w-5 h-5" />
                </div>
                <div>
                    {profileLoading ? (
                        <div className="h-7 w-24 bg-slate-200 rounded animate-pulse dark:bg-slate-700" />
                    ) : (
                        <h1 className="text-xl font-bold text-slate-800 tracking-tight dark:text-slate-50">
                            Hi, {displayName}
                        </h1>
                    )}
                    <p className="text-slate-500 font-medium text-sm dark:text-slate-400">Welcome back!</p>
                </div>
            </div>

            {/* Center: Version string (absolute positioned, below safe area) */}
            <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{ top: 'calc(var(--safe-area-top, 0px) + 1rem)' }}
            >
                <p className="text-slate-400 font-mono text-[10px] dark:text-slate-500">{getVersionString()}</p>
            </div>

            {/* Right: Settings button */}
            {isOnSettings ? (
                <button onClick={handleSettingsClick} className="relative group">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg shadow-sky-200 transition-transform active:scale-95 bg-primary dark:bg-sky-500 dark:shadow-sky-900/50">
                        <Settings className="w-5 h-5" />
                    </div>
                </button>
            ) : (
                <NavLink to="/settings" className="relative group">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sky-700 transition-transform active:scale-95 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:hover:bg-sky-900/50">
                        <Settings className="w-5 h-5" />
                    </div>
                </NavLink>
            )}
        </header>
    );
};
