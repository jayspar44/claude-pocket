import React, { createContext, useContext, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    // Initialize theme from localStorage, default to 'light'
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('app_pref_theme') || 'light';
    });

    // Apply theme to document root
    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [theme]);

    // Update StatusBar based on theme (Android/iOS)
    // Note: Style.Dark = light/white icons, Style.Light = dark/black icons
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            if (theme === 'dark') {
                // Dark mode: light icons on dark background
                StatusBar.setStyle({ style: Style.Dark });
                StatusBar.setBackgroundColor({ color: '#1e293b' }); // slate-800
            } else {
                // Light mode: dark icons on light blue background
                StatusBar.setStyle({ style: Style.Light });
                StatusBar.setBackgroundColor({ color: '#0ea5e9' }); // sky-500
            }
        }
    }, [theme]);

    // Persist theme to localStorage
    useEffect(() => {
        localStorage.setItem('app_pref_theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    const value = {
        theme,
        setTheme,
        toggleTheme,
        isDark: theme === 'dark'
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};
