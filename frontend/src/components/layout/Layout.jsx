import { Outlet } from 'react-router-dom';
import { MobileContainer } from './MobileContainer';
import { Navbar } from './Navbar';
import { TopBar } from './TopBar';
import { useUserPreferences } from '../../contexts/UserPreferencesContext';
import { useConnection } from '../../contexts/ConnectionContext';

export const Layout = () => {
    const { developerMode } = useUserPreferences();
    const { isOnline, isApiConnected } = useConnection();

    return (
        <MobileContainer>
            {/* Notification bars - sticky at top, accounting for safe area */}
            {developerMode && (
                <div
                    className="sticky bg-amber-100 text-amber-800 text-[10px] font-bold text-center py-1 border-b border-amber-200 z-50 dark:bg-amber-900 dark:text-amber-200 dark:border-amber-800"
                    style={{ top: 'var(--safe-area-top, 0px)' }}
                >
                    Developer Mode Active
                </div>
            )}
            {!isOnline && (
                <div
                    className="sticky bg-red-600 text-white text-xs font-semibold text-center py-2 border-b border-red-700 z-50"
                    style={{ top: 'var(--safe-area-top, 0px)' }}
                >
                    ⚠️ No Internet Connection
                </div>
            )}
            {isOnline && !isApiConnected && (
                <div
                    className="sticky bg-orange-600 text-white text-xs font-semibold text-center py-2 border-b border-orange-700 z-50"
                    style={{ top: 'var(--safe-area-top, 0px)' }}
                >
                    ⚠️ Cannot Connect to Server - Check if backend is running
                </div>
            )}

            {/* TopBar - absolutely positioned for all pages */}
            <TopBar />

            {/* Content area - absolutely positioned with padding for TopBar and Navbar */}
            <div
                className="absolute inset-0 overflow-y-auto z-10 custom-scrollbar"
                style={{
                    paddingTop: 'calc(var(--safe-area-top, 0px) + 4.5rem)', // Safe area + TopBar height
                    paddingBottom: 'calc(1.5rem + 4rem + var(--safe-area-bottom, 0px))' // Navbar + gap
                }}
            >
                <Outlet />
            </div>

            {/* Navbar - absolutely positioned */}
            <Navbar />
        </MobileContainer>
    );
};
