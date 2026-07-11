// In-memory access token holder — shared between auth store and API client.
// Avoids circular dep: auth.svelte.ts → api/index.ts → auth.svelte.ts.
// Access token is intentionally NOT persisted to localStorage (XSS-safe).
import { authClientApi } from './auth-client';

let _token: string | null = null;

export function setToken(token: string | null): void {
    _token = token;
}

export function getToken(): string | null {
    return _token;
}

// Single, app-wide deduplicated refresh call. The backend rotates refresh
// tokens (single-use — deleted from Redis once consumed), so any two
// concurrent /auth/refresh calls will race and one will fail. Both the auth
// store (proactive/scheduled refresh) and the API client (reactive 401
// retry) must share this exact promise so only one refresh is ever in
// flight app-wide, instead of each keeping its own separate dedup state.
let _refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
    if (!_refreshPromise) {
        _refreshPromise = authClientApi.refresh()
            .then((response) => {
                const token = response.success ? response.data?.accessToken ?? null : null;
                setToken(token);
                return token;
            })
            .catch(() => null)
            .finally(() => {
                _refreshPromise = null;
            });
    }
    return _refreshPromise;
}
