// ═══════════════════════════════════════════════════════════════════════════
// LINE Messaging API client (channel access token, broadcast messages).
//
// Not LINE Notify — that API was deprecated/shut down by LINE in March 2025.
// The Messaging API requires a LINE Official Account + a channel access
// token (issued in the LINE Developers Console), and sends via *broadcast*
// (delivered to everyone currently following the OA) — no per-customer LINE
// user ID linking needed for this v1.
//
// Docs: https://developers.line.biz/en/reference/messaging-api/
// ═══════════════════════════════════════════════════════════════════════════

const LINE_API_BASE = 'https://api.line.me/v2/bot';

export interface LineChannelInfo {
    displayName: string;
    userId: string;
    basicId: string;
}

export class LineApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = 'LineApiError';
    }
}

async function lineRequest(path: string, token: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${LINE_API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
    });
    if (!res.ok) {
        let message = `LINE API request failed (${res.status})`;
        try {
            const body = await res.json() as { message?: string };
            if (body?.message) message = body.message;
        } catch {
            // ignore body parse failure
        }
        throw new LineApiError(message, res.status);
    }
    return res;
}

// Verifies the channel access token is valid and returns the OA's identity —
// used both for "Connect" (fail fast on a bad token) and to show the shop
// which OA they've connected.
export async function verifyChannelToken(channelAccessToken: string): Promise<LineChannelInfo> {
    const res = await lineRequest('/info', channelAccessToken);
    return res.json() as Promise<LineChannelInfo>;
}

export async function broadcastMessage(channelAccessToken: string, text: string): Promise<void> {
    await lineRequest('/message/broadcast', channelAccessToken, {
        method: 'POST',
        body: JSON.stringify({
            messages: [{ type: 'text', text }],
        }),
    });
}
