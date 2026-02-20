import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import Terminal from './pages/Terminal';
import Settings from './pages/Settings';
import { InstanceProvider } from './contexts/InstanceContext';
import { RelayProvider } from './contexts/RelayContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { setupKeyboardListeners } from './utils/keyboard';
import { migrateStorage } from './utils/storage';

// Run migration before React mounts to ensure storage keys are prefixed by port
migrateStorage();

// Inner component that has access to router context
function AppContent() {
  const location = useLocation();

  // Setup keyboard listeners for native platforms
  useEffect(() => {
    const cleanup = setupKeyboardListeners();
    return cleanup;
  }, []);

  // Set page title
  useEffect(() => {
    document.title = 'Claude Pocket';
  }, []);

  // Handle back button on Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapApp.addListener('backButton', () => {
      if (location.pathname === '/') {
        // On terminal screen, minimize app (keeps WebSocket connected)
        CapApp.minimizeApp();
      } else {
        // On other screens, go back
        window.history.back();
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [location.pathname]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-900 text-white">
      <Routes>
        <Route path="/" element={<Terminal />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <InstanceProvider>
        <RelayProvider>
          <AppContent />
        </RelayProvider>
      </InstanceProvider>
    </ThemeProvider>
  );
}

export default App;
