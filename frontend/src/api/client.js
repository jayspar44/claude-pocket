import axios from 'axios';
import { getAuth } from 'firebase/auth';

const client = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    timeout: 10000, // 10 second timeout
});

// Store connection status callback
let connectionStatusCallback = null;

export const setConnectionStatusCallback = (callback) => {
    connectionStatusCallback = callback;
};

client.interceptors.request.use(async (config) => {
    const auth = getAuth();
    if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor to handle connection errors
client.interceptors.response.use(
    (response) => {
        // Request succeeded, mark API as connected
        if (connectionStatusCallback) {
            connectionStatusCallback(true);
        }
        return response;
    },
    (error) => {
        // Check for network/connection errors
        if (error.code === 'ECONNREFUSED' ||
            error.code === 'ERR_NETWORK' ||
            error.code === 'ECONNABORTED' ||
            error.message === 'Network Error' ||
            !error.response) {
            // API is unreachable
            if (connectionStatusCallback) {
                connectionStatusCallback(false);
            }
        } else if (error.response) {
            // Got a response, so API is connected (even if error status)
            if (connectionStatusCallback) {
                connectionStatusCallback(true);
            }
        }

        return Promise.reject(error);
    }
);

export default client;
