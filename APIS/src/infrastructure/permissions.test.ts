import { describe, it, expect } from 'vitest';
import { P, hasPerm, combinePerm, mergeMasks, legacyPermTobit, permissionsToMask, maskToStrings, stringsToMask } from './permissions';

describe('hasPerm', () => {
    it('returns true when low bit is set', () => {
        expect(hasPerm(P.SALE_CREATE.low, 0n, P.SALE_CREATE)).toBe(true);
    });

    it('returns false when bit is not set', () => {
        expect(hasPerm(0n, 0n, P.SALE_CREATE)).toBe(false);
    });

    it('returns true when high bit is set for platform perms', () => {
        expect(hasPerm(0n, P.PLATFORM_SUPER_ADMIN.high, P.PLATFORM_SUPER_ADMIN)).toBe(true);
    });

    it('returns false when only high but not low matches (low-only perm)', () => {
        // SALE_CREATE has high=0n; even if user has some high bits, low must match
        expect(hasPerm(0n, P.PLATFORM_SUPER_ADMIN.high, P.SALE_CREATE)).toBe(false);
    });

    it('does not confuse SALE_VIEW bit with SALE_CREATE bit', () => {
        // bit 0 = SALE_VIEW, bit 1 = SALE_CREATE
        const saleViewOnly = P.SALE_VIEW.low;
        expect(hasPerm(saleViewOnly, 0n, P.SALE_VIEW)).toBe(true);
        expect(hasPerm(saleViewOnly, 0n, P.SALE_CREATE)).toBe(false);
    });
});

describe('combinePerm', () => {
    it('combines two low-bit perms', () => {
        const combined = combinePerm(P.SALE_VIEW, P.SALE_CREATE);
        expect(hasPerm(combined.low, combined.high, P.SALE_VIEW)).toBe(true);
        expect(hasPerm(combined.low, combined.high, P.SALE_CREATE)).toBe(true);
        expect(hasPerm(combined.low, combined.high, P.SALE_VOID)).toBe(false);
    });

    it('combines low and high perms', () => {
        const combined = combinePerm(P.SALE_CREATE, P.PLATFORM_AUDIT_VIEW);
        expect(hasPerm(combined.low, combined.high, P.SALE_CREATE)).toBe(true);
        expect(hasPerm(combined.low, combined.high, P.PLATFORM_AUDIT_VIEW)).toBe(true);
    });

    it('handles single perm', () => {
        const combined = combinePerm(P.REPORT_SALES);
        expect(hasPerm(combined.low, combined.high, P.REPORT_SALES)).toBe(true);
    });

    it('handles empty args', () => {
        const combined = combinePerm();
        expect(combined.low).toBe(0n);
        expect(combined.high).toBe(0n);
    });
});

describe('mergeMasks', () => {
    it('ORs two masks', () => {
        const a = { low: P.SALE_VIEW.low, high: 0n };
        const b = { low: P.SALE_CREATE.low, high: 0n };
        const merged = mergeMasks(a, b);
        expect(hasPerm(merged.low, merged.high, P.SALE_VIEW)).toBe(true);
        expect(hasPerm(merged.low, merged.high, P.SALE_CREATE)).toBe(true);
    });
});

describe('legacyPermTobit', () => {
    it('maps "sales:create" to SALE_CREATE', () => {
        const bit = legacyPermTobit('sales:create');
        expect(bit).toBeDefined();
        if (bit) expect(hasPerm(bit.low, bit.high, P.SALE_CREATE)).toBe(true);
    });

    it('maps "reports:view" to REPORT_SALES', () => {
        const bit = legacyPermTobit('reports:view');
        expect(bit).toBeDefined();
    });

    it('returns undefined for unknown string', () => {
        expect(legacyPermTobit('nonexistent:permission')).toBeUndefined();
    });
});

describe('permissionsToMask / maskToStrings / stringsToMask round-trip', () => {
    it('encodes permissions into non-zero masks', () => {
        const mask = permissionsToMask(['sales:create', 'sales:view', 'reports:view']);
        expect(mask.low).toBeGreaterThan(0n);
        expect(hasPerm(mask.low, mask.high, P.SALE_CREATE)).toBe(true);
        expect(hasPerm(mask.low, mask.high, P.SALE_VIEW)).toBe(true);
        expect(hasPerm(mask.low, mask.high, P.REPORT_SALES)).toBe(true);
        expect(hasPerm(mask.low, mask.high, P.PRODUCT_DELETE)).toBe(false);
    });

    it('returns zero masks for empty array', () => {
        const mask = permissionsToMask([]);
        expect(mask.low).toBe(0n);
        expect(mask.high).toBe(0n);
    });

    it('wildcard * grants all bits', () => {
        const mask = permissionsToMask(['*']);
        expect(hasPerm(mask.low, mask.high, P.SALE_CREATE)).toBe(true);
        expect(hasPerm(mask.low, mask.high, P.PLATFORM_SUPER_ADMIN)).toBe(true);
    });

    it('serialises and deserialises through strings without loss', () => {
        const original = permissionsToMask(['sales:create', 'reports:view']);
        const serialised = maskToStrings(original);
        const restored = stringsToMask(serialised);
        expect(restored.low).toBe(original.low);
        expect(restored.high).toBe(original.high);
    });
});
