// ═══════════════════════════════════════════════════════════════════════════
// KPOS - API Routes
// ═══════════════════════════════════════════════════════════════════════════

import type { Application } from 'express';
import { Router } from 'express';
import { appConfig } from '@/config/app.config';

// Import module routes
import { authRoutes } from '@/modules/auth/presentation/routes';
import { userRoutes } from '@/modules/users/presentation/routes';
import { roleRoutes } from '@/modules/roles/presentation/routes';
import { productRoutes } from '@/modules/products/presentation/routes';
import { categoryRoutes } from '@/modules/categories/presentation/routes';
import { inventoryRoutes } from '@/modules/inventory/presentation/routes';
import { salesRoutes } from '@/modules/sales/presentation/routes';
import { customerRoutes } from '@/modules/customers/presentation/routes';
import { branchRoutes } from '@/modules/branches/presentation/routes';
import { storeRoutes } from '@/modules/stores/presentation/routes';
import { reportRoutes } from '@/modules/reports/presentation/routes';
import { settingRoutes } from '@/modules/settings/presentation/routes';
import { dashboardRoutes } from '@/modules/dashboard/presentation/routes';
import { staffRoutes } from '@/modules/staff/presentation/routes';
import { promotionRoutes } from '@/modules/promotions/presentation/routes';
import { restaurantRoutes } from '@/modules/restaurant/presentation/routes';
import { paymentRoutes } from '@/modules/payments/presentation/routes';
import { adminRoutes } from '@/modules/admin/presentation/routes';
import { documentRoutes } from '@/modules/documents/presentation/routes';
import { uploadRoutes } from '@/infrastructure/services/upload.routes';
import { notificationRoutes } from '@/infrastructure/services/notification.routes';

export function setupRoutes(app: Application): void {
    const apiRouter = Router();

    // Infrastructure routes
    apiRouter.use('/upload', uploadRoutes);
    apiRouter.use('/notifications', notificationRoutes);

    // Mount module routes
    apiRouter.use('/auth', authRoutes);
    apiRouter.use('/users', userRoutes);
    apiRouter.use('/roles', roleRoutes);
    apiRouter.use('/products', productRoutes);
    apiRouter.use('/categories', categoryRoutes);
    apiRouter.use('/inventory', inventoryRoutes);
    apiRouter.use('/sales', salesRoutes);
    apiRouter.use('/customers', customerRoutes);
    apiRouter.use('/branches', branchRoutes);
    apiRouter.use('/stores', storeRoutes);
    apiRouter.use('/reports', reportRoutes);
    apiRouter.use('/settings', settingRoutes);
    apiRouter.use('/dashboard', dashboardRoutes);
    apiRouter.use('/staff', staffRoutes);
    apiRouter.use('/promotions', promotionRoutes);
    apiRouter.use('/restaurant', restaurantRoutes);
    apiRouter.use('/payments', paymentRoutes);
    apiRouter.use('/admin', adminRoutes);  // Super Admin routes
    apiRouter.use('/documents', documentRoutes);  // Invoices & Tax Invoices

    // Mount API router with version prefix
    app.use(`/api/${appConfig.apiVersion}`, apiRouter);
}
