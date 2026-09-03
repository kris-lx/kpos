// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Shared Shift Status Store
// ═══════════════════════════════════════════════════════════════════════════
// The navbar's clock-in/out indicator (+layout.svelte) and the shift
// open/close actions (staff/shifts/+page.svelte) each kept their own
// page-local `currentShift` state — closing a shift on the shifts page
// never touched the layout's copy, so the navbar kept showing "on shift"
// (green, live-updating dot) until the user navigated away and the layout
// re-fetched on its own. Both now read/write this single shared state so
// clocking in or out reflects everywhere immediately, no reload needed.

let currentShift = $state<any>(null);

export const shiftStore = {
    get current() { return currentShift; },
    set(shift: any) { currentShift = shift; },
};
