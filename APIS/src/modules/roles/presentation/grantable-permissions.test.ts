import { describe, expect, it } from 'vitest';
import { grantablePermissionCatalog } from './routes';

const grouped = {
    roles: {
        key: 'roles',
        label: 'Roles',
        permissions: [
            { key: 'roles:view', label: 'View roles' },
            { key: 'roles:create', label: 'Create roles' },
        ],
    },
    sales: {
        key: 'sales',
        label: 'Sales',
        permissions: [{ key: 'sales:create', label: 'Create sales' }],
    },
};

describe('grantablePermissionCatalog', () => {
    it('returns only the permission subset held by a Store Owner', () => {
        const result = grantablePermissionCatalog({ authUser: { permissions: ['roles:view', 'roles:create'] } }, grouped);
        expect(result.all).toEqual(['roles:view', 'roles:create']);
        expect(result.grouped.sales).toBeUndefined();
        expect(result.excludedCount).toBe(1);
    });

    it('returns the complete catalog for Super Admin', () => {
        const result = grantablePermissionCatalog({ authUser: { isSuperAdmin: true, permissions: [] } }, grouped);
        expect(result.all).toEqual(['roles:view', 'roles:create', 'sales:create']);
        expect(result.excludedCount).toBe(0);
    });
});
