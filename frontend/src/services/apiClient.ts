import axios from 'axios';

/**
 * Axios API client instance.
 * For the current research phase, requests are intercepted or defaulted to the local mock provider.
 * When real backend endpoints are ready, only this base configuration and API endpoints need adjustment.
 */
export const apiClient = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Application': 'STAGRA-Web-Instrumentation',
    'X-Research-Project': 'Stagnant Water Assessment and Growth Risk Analysis',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Graceful error logging for university research environment
    console.warn('[STAGRA API Service Warning]: Network request handled via fallback', error?.message);
    return Promise.reject(error);
  }
);
