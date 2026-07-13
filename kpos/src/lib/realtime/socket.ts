import { PUBLIC_API_URL } from '$env/static/public';
import { io, type Socket } from 'socket.io-client';
import { getToken } from '$lib/api/token';

let socket: Socket | null = null;

function getSocketOrigin(): string {
    try {
        return new URL(PUBLIC_API_URL).origin;
    } catch {
        // PUBLIC_API_URL is a relative path (e.g. "/api/v1") — same-origin
        // as the page itself, so there's no separate host to parse out.
        return window.location.origin;
    }
}

export function getRealtimeSocket(): Socket | null {
    const token = getToken();
    if (!token || !PUBLIC_API_URL) return null;

    if (socket) {
        socket.auth = { token };
        if (!socket.connected) socket.connect();
        return socket;
    }

    socket = io(getSocketOrigin(), {
        auth: { token },
        autoConnect: true,
        transports: ['websocket', 'polling'],
        withCredentials: true,
    });

    return socket;
}

export function disconnectRealtimeSocket(): void {
    socket?.disconnect();
    socket = null;
}
