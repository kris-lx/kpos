// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Auth API Client (No circular dependency)
// ═══════════════════════════════════════════════════════════════════════════

import ky from 'ky';
import { PUBLIC_API_URL } from '$env/static/public';

const API_URL = PUBLIC_API_URL || 'http://localhost:5000/api/v1';

// Simple API client for auth operations (no auth interceptor needed)
const authClient = ky.create({
    prefixUrl: API_URL,
    timeout: 30000,
});

// API Response Type
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
        branchId: string;
    };
}

export interface RefreshResponse {
    accessToken: string;
    refreshToken: string;
}

// Auth API functions
export const authClientApi = {
    login: (email: string, password: string) =>
        authClient.post('auth/login', { json: { email, password } }).json<ApiResponse<LoginResponse>>(),

    refresh: (refreshToken: string) =>
        authClient.post('auth/refresh', { json: { refreshToken } }).json<ApiResponse<RefreshResponse>>(),

    logout: (accessToken: string) =>
        authClient.post('auth/logout', {
            headers: { Authorization: `Bearer ${accessToken}` }
        }).json<ApiResponse<{ message: string }>>(),
};
