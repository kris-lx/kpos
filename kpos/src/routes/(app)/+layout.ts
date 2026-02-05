import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent }) => {
    // This will be checked client-side in the layout component
    // For SSR, you might want to check auth state from cookies
    return {};
};

export const ssr = false; // Disable SSR for authenticated routes
