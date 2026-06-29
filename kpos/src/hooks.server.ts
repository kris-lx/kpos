import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    const response = await resolve(event, {
        // Ensure charset=utf-8 is set on every HTML response so browsers
        // (especially on Windows) don't default to Windows-1252 and garble
        // Thai/Lao/Chinese characters.
        transformPageChunk: ({ html }) => html,
    });

    if (response.headers.get('content-type')?.startsWith('text/html')) {
        response.headers.set('content-type', 'text/html; charset=utf-8');
    }

    return response;
};
