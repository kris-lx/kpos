// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Auth API Client (No circular dependency)
// ═══════════════════════════════════════════════════════════════════════════

import ky from 'ky';
import { PUBLIC_API_URL } from '$env/static/public';

if (!PUBLIC_API_URL) {
    console.error('[KPOS] PUBLIC_API_URL is not set. Please add it to your .env file.');
}
const API_URL = PUBLIC_API_URL;

// credentials: 'include' is required for the browser to send the HttpOnly refresh cookie (NEW-01)
const authClient = ky.create({
    prefixUrl: API_URL,
    timeout: 30000,
    credentials: 'include',
});

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
}

// refreshToken is NOT in the login response body — it arrives via Set-Cookie (BE-04)
export interface LoginResponse {
    accessToken: string;
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
        branchId: string;
        tenantId: string;
        isSuperAdmin?: boolean;
        permissions?: string[];
    };
}

// refreshToken is NOT in the refresh response body — new cookie is set by the server
export interface RefreshResponse {
    accessToken: string;
}

export const authClientApi = {
    login: (email: string, password: string) =>
        authClient.post('auth/login', { json: { email, password } }).json<ApiResponse<LoginResponse>>(),

    // No refreshToken body — browser sends the HttpOnly cookie automatically
    refresh: () =>
        authClient.post('auth/refresh').json<ApiResponse<RefreshResponse>>(),

    logout: (accessToken: string) =>
        authClient.post('auth/logout', {
            headers: { Authorization: `Bearer ${accessToken}` }
        }).json<ApiResponse<{ message: string }>>(),
};
