import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/services';
import { useAuth } from './AuthContext';
import { logger } from '../utils/logger';

const UserPreferencesContext = createContext();

export const useUserPreferences = () => useContext(UserPreferencesContext);

export const UserPreferencesProvider = ({ children }) => {
    const { user } = useAuth();

    // -- Local Preferences --
    // Developer Mode Master Switch
    const [developerMode, setDeveloperMode] = useState(() => {
        return localStorage.getItem('app_pref_devMode') === 'true';
    });

    // -- Backend User Profile --
    const [firstName, setFirstName] = useState('');
    const [registeredDate, setRegisteredDate] = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);

    // Persistence Effects
    useEffect(() => {
        localStorage.setItem('app_pref_devMode', developerMode);
    }, [developerMode]);

    // Fetch Profile on Load / Auth Change
    useEffect(() => {
        const fetchProfile = async () => {
            if (user) {
                try {
                    setProfileLoading(true);
                    logger.debug('Fetching User Profile...');
                    const data = await api.getUserProfile();
                    logger.debug('Profile Data Received:', data);

                    if (data) {
                        if (data.firstName !== undefined) setFirstName(data.firstName);
                        if (data.registeredDate) setRegisteredDate(data.registeredDate);
                    }
                } catch (error) {
                    logger.error('Failed to load user profile', error);
                } finally {
                    setProfileLoading(false);
                }
            } else {
                setFirstName('');
                setRegisteredDate(null);
            }
        };

        fetchProfile();
    }, [user]);

    const saveFirstName = async (name) => {
        try {
            await api.updateUserProfile({ firstName: name });
            setFirstName(name);
            return true;
        } catch (e) {
            logger.error('Failed to save name', e);
            throw e;
        }
    };

    const updateProfileConfig = async (updates) => {
        try {
            await api.updateUserProfile(updates);
            if (updates.firstName !== undefined) setFirstName(updates.firstName);
            if (updates.registeredDate !== undefined) setRegisteredDate(updates.registeredDate);
            return true;
        } catch (e) {
            logger.error('Failed to save config', e);
            throw e;
        }
    };

    const value = {
        developerMode,
        setDeveloperMode,
        firstName,
        registeredDate,
        saveFirstName,
        updateProfileConfig,
        profileLoading
    };

    return (
        <UserPreferencesContext.Provider value={value}>
            {children}
        </UserPreferencesContext.Provider>
    );
};
