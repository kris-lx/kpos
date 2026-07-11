// ═══════════════════════════════════════════════════════════════════════════
// Regression test for the upload cross-tenant overwrite/delete fix: uploads
// used to accept a fully client-controlled `folder`, and combined with a
// deterministic public_id derived from the original filename, let any
// authenticated user overwrite or delete another tenant's assets by guessing
// a common folder/filename. Fixed by always namespacing under
// `tenant/{callerTenantId}/...` server-side — the client's folder is only
// ever a cosmetic subfolder underneath that, never the whole path.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { tenantFolder, canDeleteUpload } from './upload.routes';

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';

describe('tenantFolder()', () => {
    it('namespaces under the caller tenant when no client folder is given', () => {
        expect(tenantFolder(TENANT_A)).toBe(`tenant/${TENANT_A}`);
    });

    it('nests a client-supplied folder under the caller tenant prefix', () => {
        expect(tenantFolder(TENANT_A, 'logos')).toBe(`tenant/${TENANT_A}/logos`);
    });

    it('cannot escape the tenant prefix via path traversal', () => {
        const result = tenantFolder(TENANT_A, '../../other-tenant/secret');
        expect(result.startsWith(`tenant/${TENANT_A}/`)).toBe(true);
        expect(result).not.toContain('..');
    });

    it('cannot escape via a leading absolute path', () => {
        const result = tenantFolder(TENANT_A, '/etc/passwd');
        expect(result.startsWith(`tenant/${TENANT_A}/`)).toBe(true);
    });

    it('a client folder that itself looks like another tenant path stays nested, never escapes', () => {
        // Even if a caller tries to smuggle a full "tenant/<other-id>/..." path
        // as their folder, it's still nested one level deeper under their OWN
        // real tenant prefix (the first path segment is always the caller's
        // own verified tenantId) — never becomes tenant/<other-id>/... at the root.
        const otherTenantId = 'tenant-b-uuid';
        const result = tenantFolder(TENANT_A, `tenant/${otherTenantId}/logos`);
        expect(result.startsWith(`tenant/${TENANT_A}/`)).toBe(true);
        expect(result.startsWith(`tenant/${otherTenantId}`)).toBe(false);
    });

    it('truncates an excessively long client folder', () => {
        const long = 'a'.repeat(500);
        const result = tenantFolder(TENANT_A, long);
        // tenant/{TENANT_A}/ prefix + at most 100 chars of sanitized folder
        expect(result.length).toBeLessThanOrEqual(`tenant/${TENANT_A}/`.length + 100);
    });

    it('strips characters outside the safe set instead of passing them through raw', () => {
        const result = tenantFolder(TENANT_A, "logos'; DROP TABLE users; --");
        expect(result).not.toContain("'");
        expect(result).not.toContain(';');
    });
});

describe('canDeleteUpload()', () => {
    it('allows deleting an asset under the caller\'s own tenant namespace', () => {
        expect(canDeleteUpload(`tenant/${TENANT_A}/logos/foo.png`, TENANT_A, false)).toBe(true);
    });

    it('blocks deleting an asset under a different tenant namespace — the core exploit case', () => {
        expect(canDeleteUpload(`tenant/${TENANT_B}/logos/foo.png`, TENANT_A, false)).toBe(false);
    });

    it('blocks a bare/legacy (pre-fix) path with no tenant prefix at all', () => {
        expect(canDeleteUpload('logos/foo.png', TENANT_A, false)).toBe(false);
    });

    it('allows a superadmin to delete across any tenant namespace', () => {
        expect(canDeleteUpload(`tenant/${TENANT_B}/logos/foo.png`, TENANT_A, true)).toBe(true);
    });

    it('a prefix-string-match trick does not bypass the check (tenant/{A}-evil is not tenant/{A}/)', () => {
        // Guards against a naive `.startsWith('tenant/' + tenantId)` (no trailing
        // slash) which would incorrectly also match "tenant/tenant-a-uuid-evil/...".
        expect(canDeleteUpload(`tenant/${TENANT_A}-evil/logos/foo.png`, TENANT_A, false)).toBe(false);
    });
});
