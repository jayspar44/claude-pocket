import React, { createContext, useContext, useState, useEffect } from 'react';

const ConnectionContext = createContext();

export const useConnection = () => {
    const context = useContext(ConnectionContext);
    if (!context) {
        throw new Error('useConnection must be used within ConnectionProvider');
    }
    return context;
};

export const ConnectionProvider = ({ children }) => {
    const [isOnline, setIsOnline] = useState(true);
    const [isApiConnected, setIsApiConnected] = useState(true);

    // Monitor browser online/offline status
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const setApiConnectionStatus = (connected) => {
        setIsApiConnected(connected);
    };

    const value = {
        isOnline,
        isApiConnected,
        setApiConnectionStatus,
        isConnected: isOnline && isApiConnected
    };

    return (
        <ConnectionContext.Provider value={value}>
            {children}
        </ConnectionContext.Provider>
    );
};
