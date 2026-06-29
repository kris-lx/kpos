// In-memory access token holder — shared between auth store and API client.
// Avoids circular dep: auth.svelte.ts → api/index.ts → auth.svelte.ts.
// Access token is intentionally NOT persisted to localStorage (XSS-safe).
let _token: string | null = null;

export function setToken(token: string | null): void {
    _token = token;
}

export function getToken(): string | null {
    return _token;
}
