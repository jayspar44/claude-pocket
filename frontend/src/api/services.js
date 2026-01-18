import axios from 'axios';
import client from './client';
import { logger } from '../utils/logger';

// Public API client (no auth required) - used for health endpoint before Firebase init
const publicClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    timeout: 5000,
});

/**
 * Get backend health info (public endpoint, no auth required)
 * @returns {Promise<{status: string, version: string, serverStartTime: string}|null>}
 */
export const getHealth = async () => {
    try {
        const response = await publicClient.get('/health');
        return response.data;
    } catch {
        return null;
    }
};

export const api = {
    // User Profile
    getUserProfile: async () => {
        const response = await client.get('/user/profile');
        return response.data;
    },

    updateUserProfile: async (data) => {
        const response = await client.post('/user/profile', data);
        return response.data;
    },

    // Notes CRUD (example domain)
    getNotes: async () => {
        logger.debug('Fetching notes');
        const response = await client.get('/notes');
        return response.data;
    },

    getNote: async (id) => {
        logger.debug(`Fetching note ${id}`);
        const response = await client.get(`/notes/${id}`);
        return response.data;
    },

    createNote: async (data) => {
        logger.debug('Creating note', data);
        const response = await client.post('/notes', data);
        return response.data;
    },

    updateNote: async (id, data) => {
        logger.debug(`Updating note ${id}`, data);
        const response = await client.put(`/notes/${id}`, data);
        return response.data;
    },

    deleteNote: async (id) => {
        logger.debug(`Deleting note ${id}`);
        const response = await client.delete(`/notes/${id}`);
        return response.data;
    },
};
