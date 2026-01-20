import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Terminal from './pages/Terminal';
import Settings from './pages/Settings';
import { RelayProvider } from './contexts/RelayContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { setupKeyboardListeners } from './utils/keyboard';

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
      <RelayProvider>
        <div className="h-screen w-screen overflow-hidden bg-gray-900 text-white">
          <Routes>
            <Route path="/" element={<Terminal />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </RelayProvider>
    </ThemeProvider>
  );
}

export default App;
