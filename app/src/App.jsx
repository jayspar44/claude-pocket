import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Terminal from './pages/Terminal';
import Settings from './pages/Settings';
import { InstanceProvider } from './contexts/InstanceContext';
import { RelayProvider } from './contexts/RelayContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { setupKeyboardListeners } from './utils/keyboard';
import { migrateStorage } from './utils/storage';

// Run migration before React mounts to ensure storage keys are prefixed by port
migrateStorage();

function App() {
  // Setup keyboard listeners for native platforms
  useEffect(() => {
    const cleanup = setupKeyboardListeners();
    return cleanup;
  }, []);

  // Set page title
  useEffect(() => {
    document.title = 'Claude Pocket';
  }, []);

  return (
    <ThemeProvider>
      <InstanceProvider>
        <RelayProvider>
          <div className="h-screen w-screen overflow-hidden bg-gray-900 text-white">
            <Routes>
              <Route path="/" element={<Terminal />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </RelayProvider>
      </InstanceProvider>
    </ThemeProvider>
  );
}

export default App;
