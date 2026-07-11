// ═══════════════════════════════════════════════════════════════════════════
// Absolute session cap (20h from login, regardless of refresh activity).
// Extracted from auth.middleware.ts / auth.service.ts where this exact check
// was duplicated inline in two places — single source of truth + testable.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param sessionStart epoch seconds of original login (JWT `sst` claim,
 *   falling back to `iat` for tokens issued before that claim existed)
 * @param sessionAbsoluteMs the configured absolute session length in ms
 *   (jwtConfig.sessionAbsoluteMs)
 * @param now injectable for tests; defaults to the real clock
 */
export function isSessionExpired(
    sessionStart: number,
    sessionAbsoluteMs: number,
    now: number = Date.now(),
): boolean {
    return now - sessionStart * 1000 > sessionAbsoluteMs;
}
