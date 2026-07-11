import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(relativePath: string): string {
    return readFileSync(join(root, relativePath), 'utf8');
}

describe('high-risk route security wiring', () => {
    it('guards POS transaction and cash mutation routes with permission middleware', () => {
        const sales = read('src/modules/sales/presentation/routes.ts');
        const required = [
            "salesRoutes.post('/', authenticate, withTenantTx(), authorize('sales:create')",
            "salesRoutes.post('/shifts/open', authenticate, withTenantTx(), authorize('sales:create')",
            "salesRoutes.post('/shifts/:id/close', authenticate, withTenantTx(), authorize('sales:update')",
            "salesRoutes.post('/shifts/:id/cash-movement', authenticate, withTenantTx(), authorize('sales:update')",
            "salesRoutes.post('/held', authenticate, withTenantTx(), authorize('sales:create')",
            "salesRoutes.delete('/held/:id', authenticate, withTenantTx(), authorize('sales:update', 'sales:delete')",
            "salesRoutes.post('/credit', authenticate, withTenantTx(), authorize('pos:credit', 'sales:create')",
            "salesRoutes.post('/credit/:id/payment', authenticate, withTenantTx(), authorize('pos:credit', 'sales:update')",
        ];

        for (const marker of required) {
            expect(sales).toContain(marker);
        }
    });

    it('guards restaurant mutating routes with permission middleware', () => {
        const restaurant = read('src/modules/restaurant/presentation/routes.ts');
        const required = [
            "restaurantRoutes.patch('/tables/:id/status', authenticate, withTenantTx(), authorize('tables:update')",
            "restaurantRoutes.post('/orders', authenticate, withTenantTx(), authorize('restaurant:manage')",
            "restaurantRoutes.put('/orders/:id', authenticate, withTenantTx(), authorize('restaurant:manage')",
            "restaurantRoutes.patch('/orders/:id/status', authenticate, withTenantTx(), authorize('restaurant:manage')",
            "restaurantRoutes.post('/orders/:id/items', authenticate, withTenantTx(), authorize('restaurant:manage')",
            "restaurantRoutes.put('/kitchen/:orderId/items/:itemId', authenticate, withTenantTx(), authorize('restaurant:kitchen', 'restaurant:manage')",
            "restaurantRoutes.patch('/kitchen/items/:id/status', authenticate, withTenantTx(), authorize('restaurant:kitchen', 'restaurant:manage')",
            "restaurantRoutes.post('/reservations', authenticate, withTenantTx(), authorize('restaurant:reservations', 'restaurant:manage')",
            "restaurantRoutes.put('/reservations/:id', authenticate, withTenantTx(), authorize('restaurant:reservations', 'restaurant:manage')",
            "restaurantRoutes.patch('/reservations/:id/status', authenticate, withTenantTx(), authorize('restaurant:reservations', 'restaurant:manage')",
            "restaurantRoutes.delete('/reservations/:id', authenticate, withTenantTx(), authorize('restaurant:reservations', 'restaurant:manage')",
        ];

        for (const marker of required) {
            expect(restaurant).toContain(marker);
        }
    });

    it('guards private document/settings mutation routes with permission middleware', () => {
        const settings = read('src/modules/settings/presentation/routes.ts');
        const documents = read('src/modules/documents/presentation/routes.ts');

        expect(settings).toContain("settingRoutes.post('/documents', authenticate, withTenantTx(), authorize('documents:create')");
        expect(settings).toContain("settingRoutes.patch('/documents/:id/status', authenticate, withTenantTx(), authorize('documents:update')");
        expect(settings).toContain("settingRoutes.post('/printers/:id/test', authenticate, withTenantTx(), authorize('settings:update')");
        expect(settings).toContain("settingRoutes.post('/notifications/test-line', authenticate, withTenantTx(), authorize('settings:update')");
        expect(documents).toContain("documentRoutes.get('/settings', authenticate, withTenantTx(), authorize('documents:view', 'documents:read', 'settings:read')");
        expect(documents).toContain("documentRoutes.put('/settings', authenticate, withTenantTx(), authorize('settings:update')");
    });
});
