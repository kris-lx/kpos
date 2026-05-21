// ═══════════════════════════════════════════════════════════════════════════
// Documents Module - Routes (Invoices & Tax Invoices)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, ensureScopeAccess, buildScopeCondition, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { documents, settings } from '@/db/schema/tables';
import { eq, and, or, ilike, isNull, gte, lte, desc, count, sql } from 'drizzle-orm';

export const documentRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// INVOICES
// ═══════════════════════════════════════════════════════════════════════════

// Get all invoices
documentRoutes.get('/invoices', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { status, page = '1', limit = '20', search, from, to } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const filter = req.branchFilter;

        const conditions: any[] = [eq(documents.type, 'INVOICE')];
        // BE-74: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            conditions.push(eq(documents.tenantId, tenantId));
        }
        const scopeCond = buildScopeCondition(filter, { storeId: documents.storeId }, 'storeId');
        if (scopeCond) conditions.push(scopeCond);

        if (status && status !== 'all') conditions.push(eq(documents.status, String(status).toUpperCase()));
        if (search) conditions.push(ilike(documents.documentNo, `%${String(search)}%`));
        if (from) conditions.push(gte(documents.createdAt, new Date(String(from))));
        if (to) conditions.push(lte(documents.createdAt, new Date(String(to) + 'T23:59:59')));

        const invWhere = and(...conditions);

        const [invoices, [{ value: total }]] = await Promise.all([
            db.query.documents.findMany({
                where: invWhere,
                offset: skip,
                limit: limitNum,
                orderBy: desc(documents.createdAt),
            }),
            db.select({ value: count() }).from(documents).where(invWhere),
        ]);

        // Transform for frontend
        const data = invoices.map((doc) => {
            const docData = doc.data as Record<string, unknown>;
            return {
                id: doc.id,
                invoiceNo: doc.documentNo,
                customer: docData?.customer || null,
                customerId: docData?.customerId || null,
                items: docData?.items || [],
                subtotal: docData?.subtotal || 0,
                tax: docData?.tax || 0,
                total: docData?.total || 0,
                dueDate: docData?.dueDate || null,
                notes: docData?.notes || '',
                status: doc.status?.toLowerCase() || 'pending',
                printCount: doc.printCount,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
            };
        });

        res.json({
            success: true,
            data,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get invoice by ID (scope-checked)
documentRoutes.get('/invoices/:id', authenticate, async (req, res, next) => {
    try {
        // BE-74: Tenant-scoped invoice lookup
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            getConds.push(eq(documents.tenantId, tenantId));
        }

        const invoice = await db.query.documents.findFirst({
            where: and(...getConds),
        });

        if (!invoice) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invoice not found or no access' } });
        }

        if (!ensureScopeAccess(invoice, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        const docData = invoice.data as Record<string, unknown>;
        res.json({
            success: true,
            data: {
                id: invoice.id,
                invoiceNo: invoice.documentNo,
                customer: docData?.customer || null,
                customerId: docData?.customerId || null,
                items: docData?.items || [],
                subtotal: docData?.subtotal || 0,
                tax: docData?.tax || 0,
                total: docData?.total || 0,
                dueDate: docData?.dueDate || null,
                notes: docData?.notes || '',
                status: invoice.status?.toLowerCase() || 'pending',
                printCount: invoice.printCount,
                createdAt: invoice.createdAt,
                updatedAt: invoice.updatedAt,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Create invoice
documentRoutes.post('/invoices', authenticate, branchFilter(), authorize('documents:create'), async (req, res, next) => {
    try {
        const {
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            customerAddress,
            items,
            subtotal,
            tax,
            total,
            dueDate,
            notes,
        } = req.body;

        const [{ value: invCount }] = await db.select({ value: count() }).from(documents).where(eq(documents.type, 'INVOICE'));
        const invoiceNo = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(invCount + 1).padStart(5, '0')}`;

        const docTenantId = req.authUser?.tenantId || req.user?.tenantId;
        // Non-HQ users submit for approval; HQ/admin can create directly as PENDING
        const roleLevel = req.authUser?.roleLevel ?? 7;
        const invInitialStatus = (req.authUser?.isSuperAdmin || roleLevel <= 4) ? 'PENDING' : 'PENDING_APPROVAL';
        const [invoice] = await db.insert(documents).values({
            tenantId: docTenantId,
            type: 'INVOICE',
            documentNo: invoiceNo,
            referenceId: req.user!.userId,
            referenceType: 'USER',
            status: invInitialStatus,
            branchId: req.authUser?.activeBranchId || null,
            storeId: req.authUser?.activeStoreId || null,
            data: {
                customerId,
                customer: { name: customerName, email: customerEmail, phone: customerPhone, address: customerAddress },
                items: items || [],
                subtotal: subtotal || 0,
                tax: tax || 0,
                total: total || 0,
                dueDate,
                notes,
                createdBy: req.user!.userId,
            },
        }).returning();

        res.status(201).json({
            success: true,
            data: {
                id: invoice.id,
                invoiceNo: invoice.documentNo,
                status: 'pending',
            },
        });
    } catch (error) {
        next(error);
    }
});

// Update invoice
documentRoutes.put('/invoices/:id', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        // BE-74: Tenant-scoped invoice update
        const tenantId = req.authUser?.tenantId;
        const updConds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) updConds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...updConds) });

        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invoice not found or no access' } });
        }

        const { customerId, customerName, customerEmail, customerPhone, customerAddress, items, subtotal, tax, total, dueDate, notes } = req.body;
        const existingData = existing.data as Record<string, unknown>;

        const [invoice] = await db.update(documents).set({
            data: {
                ...existingData,
                customerId,
                customer: { name: customerName, email: customerEmail, phone: customerPhone, address: customerAddress },
                items: items || existingData.items,
                subtotal: subtotal ?? existingData.subtotal,
                tax: tax ?? existingData.tax,
                total: total ?? existingData.total,
                dueDate, notes,
                updatedBy: req.user!.userId,
            },
            updatedAt: new Date(),
        }).where(and(...updConds)).returning();

        res.json({ success: true, data: { id: invoice.id } });
    } catch (error) {
        next(error);
    }
});

// Delete invoice
documentRoutes.delete('/invoices/:id', authenticate, authorize('documents:delete'), async (req, res, next) => {
    try {
        // BE-74: Tenant-scoped invoice delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) delConds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...delConds) });

        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invoice not found or no access' } });
        }

        await db.delete(documents).where(and(...delConds));

        res.json({ success: true, message: 'Invoice deleted' });
    } catch (error) {
        next(error);
    }
});

// Mark invoice as paid
documentRoutes.put('/invoices/:id/mark-paid', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const tenantId = req.authUser?.tenantId;
        const conds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) conds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...conds) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });

        const [invoice] = await db.update(documents).set({ status: 'PAID', updatedAt: new Date() }).where(and(...conds)).returning();

        res.json({ success: true, data: { id: invoice.id, status: 'paid' } });
    } catch (error) {
        next(error);
    }
});

// Send invoice
documentRoutes.post('/invoices/:id/send', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const tenantId = req.authUser?.tenantId;
        const conds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) conds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...conds) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });

        const [invoice] = await db.update(documents).set({ status: 'SENT', updatedAt: new Date() }).where(and(...conds)).returning();

        // TODO: Implement email sending

        res.json({ success: true, data: { id: invoice.id, status: 'sent' } });
    } catch (error) {
        next(error);
    }
});

// Approve invoice (maker/checker)
documentRoutes.patch('/invoices/:id/approve', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const roleLevel = req.authUser?.roleLevel ?? 7;
        if (!req.authUser?.isSuperAdmin && roleLevel > 4) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only HQ admins or above can approve invoices' } });
        }
        const tenantId = req.authUser?.tenantId;
        const conds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) conds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...conds) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
        if (!['PENDING_APPROVAL', 'PENDING'].includes(existing.status)) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Invoice is already ${existing.status}` } });
        }
        const [invoice] = await db.update(documents).set({ status: 'APPROVED', updatedAt: new Date() }).where(and(...conds)).returning();
        res.json({ success: true, data: { id: invoice.id, status: 'approved' } });
    } catch (error) {
        next(error);
    }
});

// Reject invoice (maker/checker)
documentRoutes.patch('/invoices/:id/reject', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const roleLevel = req.authUser?.roleLevel ?? 7;
        if (!req.authUser?.isSuperAdmin && roleLevel > 4) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only HQ admins or above can reject invoices' } });
        }
        const { reason } = req.body;
        const tenantId = req.authUser?.tenantId;
        const conds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) conds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...conds) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
        if (!['PENDING_APPROVAL', 'PENDING'].includes(existing.status)) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Invoice is already ${existing.status}` } });
        }
        const existingData = existing.data as Record<string, unknown>;
        const [invoice] = await db.update(documents).set({ status: 'REJECTED', data: { ...existingData, rejectionReason: reason }, updatedAt: new Date() }).where(and(...conds)).returning();
        res.json({ success: true, data: { id: invoice.id, status: 'rejected' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TAX INVOICES
// ═══════════════════════════════════════════════════════════════════════════

// Get all tax invoices
documentRoutes.get('/tax-invoices', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { status, page = '1', limit = '20', search, from, to } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const filter = req.branchFilter;

        const tConditions: any[] = [eq(documents.type, 'TAX_INVOICE')];
        // BE-74: Tenant isolation on tax invoices
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            tConditions.push(eq(documents.tenantId, tenantId));
        }
        const tScopeCond = buildScopeCondition(filter, { storeId: documents.storeId }, 'storeId');
        if (tScopeCond) tConditions.push(tScopeCond);

        if (status && status !== 'all') tConditions.push(eq(documents.status, String(status).toUpperCase()));
        if (search) tConditions.push(ilike(documents.documentNo, `%${String(search)}%`));
        if (from) tConditions.push(gte(documents.createdAt, new Date(String(from))));
        if (to) tConditions.push(lte(documents.createdAt, new Date(String(to) + 'T23:59:59')));

        const tWhere = and(...tConditions);

        const [invoices, [{ value: total }]] = await Promise.all([
            db.query.documents.findMany({
                where: tWhere,
                offset: skip,
                limit: limitNum,
                orderBy: desc(documents.createdAt),
            }),
            db.select({ value: count() }).from(documents).where(tWhere),
        ]);

        // Transform for frontend
        const data = invoices.map((doc) => {
            const docData = doc.data as Record<string, unknown>;
            return {
                id: doc.id,
                invoiceNumber: doc.documentNo,
                customerName: docData?.customerName || '',
                taxId: docData?.taxId || '',
                orderId: docData?.orderId || '',
                subtotal: docData?.subtotal || 0,
                taxAmount: docData?.taxAmount || 0,
                total: docData?.total || 0,
                status: doc.status?.toLowerCase() || 'pending',
                issuedAt: docData?.issuedAt || null,
                printCount: doc.printCount,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
            };
        });

        res.json({
            success: true,
            data,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get tax invoice by ID (scope-checked)
documentRoutes.get('/tax-invoices/:id', authenticate, async (req, res, next) => {
    try {
        // BE-74: Tenant-scoped tax invoice lookup
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'TAX_INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) getConds.push(eq(documents.tenantId, tenantId));

        const invoice = await db.query.documents.findFirst({
            where: and(...getConds),
        });

        if (!invoice) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tax invoice not found or no access' } });
        }

        if (!ensureScopeAccess(invoice, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        const docData = invoice.data as Record<string, unknown>;
        res.json({
            success: true,
            data: {
                id: invoice.id,
                invoiceNumber: invoice.documentNo,
                customerName: docData?.customerName || '',
                taxId: docData?.taxId || '',
                orderId: docData?.orderId || '',
                subtotal: docData?.subtotal || 0,
                taxAmount: docData?.taxAmount || 0,
                total: docData?.total || 0,
                status: invoice.status?.toLowerCase() || 'pending',
                issuedAt: docData?.issuedAt || null,
                printCount: invoice.printCount,
                createdAt: invoice.createdAt,
            },
        });
    } catch (error) {
        next(error);
    }
});

// Create tax invoice
documentRoutes.post('/tax-invoices', authenticate, branchFilter(), authorize('documents:create'), async (req, res, next) => {
    try {
        const { customerName, taxId, orderId, subtotal, taxAmount, total } = req.body;

        // Generate tax invoice number
        const [{ value: txiCount }] = await db.select({ value: count() }).from(documents).where(eq(documents.type, 'TAX_INVOICE'));
        const invoiceNumber = `TXI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(txiCount + 1).padStart(5, '0')}`;

        const taxDocTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const taxRoleLevel = req.authUser?.roleLevel ?? 7;
        const taxInitialStatus = (req.authUser?.isSuperAdmin || taxRoleLevel <= 4) ? 'PENDING' : 'PENDING_APPROVAL';
        const [invoice] = await db.insert(documents).values({
            tenantId: taxDocTenantId,
            type: 'TAX_INVOICE',
            documentNo: invoiceNumber,
            referenceId: req.user!.userId,
            referenceType: 'USER',
            status: taxInitialStatus,
            branchId: req.authUser?.activeBranchId || null,
            storeId: req.authUser?.activeStoreId || null,
            data: { customerName, taxId, orderId, subtotal: subtotal || 0, taxAmount: taxAmount || 0, total: total || 0, createdBy: req.user!.userId },
        }).returning();

        res.status(201).json({
            success: true,
            data: {
                id: invoice.id,
                invoiceNumber: invoice.documentNo,
                status: 'pending',
            },
        });
    } catch (error) {
        next(error);
    }
});

// Update tax invoice (scope-checked)
documentRoutes.put('/tax-invoices/:id', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        // BE-74: Tenant-scoped tax invoice update
        const tenantId = req.authUser?.tenantId;
        const updConds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'TAX_INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) updConds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...updConds) });

        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tax invoice not found or no access' } });
        }

        if (!ensureScopeAccess(existing, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        const { customerName, taxId, orderId, subtotal, taxAmount, total } = req.body;
        const existingData = existing.data as Record<string, unknown>;

        const [invoice] = await db.update(documents).set({
            data: { ...existingData, customerName, taxId, orderId, subtotal: subtotal ?? existingData.subtotal, taxAmount: taxAmount ?? existingData.taxAmount, total: total ?? existingData.total, updatedBy: req.user!.userId },
            updatedAt: new Date(),
        }).where(and(...updConds)).returning();

        res.json({ success: true, data: { id: invoice.id } });
    } catch (error) {
        next(error);
    }
});

// Delete tax invoice (scope-checked)
documentRoutes.delete('/tax-invoices/:id', authenticate, authorize('documents:delete'), async (req, res, next) => {
    try {
        // BE-74: Tenant-scoped tax invoice delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'TAX_INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) delConds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...delConds) });

        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tax invoice not found or no access' } });
        }

        if (!ensureScopeAccess(existing, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        await db.delete(documents).where(and(...delConds));

        res.json({ success: true, message: 'Tax invoice deleted' });
    } catch (error) {
        next(error);
    }
});

// Issue tax invoice (scope-checked)
documentRoutes.put('/tax-invoices/:id/issue', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        // BE-74: Tenant-scoped tax invoice issue
        const tenantId = req.authUser?.tenantId;
        const issConds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'TAX_INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) issConds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...issConds) });

        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tax invoice not found or no access' } });
        }

        if (!ensureScopeAccess(existing, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        const existingData = existing.data as Record<string, unknown>;

        const [invoice] = await db.update(documents).set({
            status: 'ISSUED',
            data: { ...existingData, issuedAt: new Date().toISOString(), issuedBy: req.user!.userId },
            updatedAt: new Date(),
        }).where(and(...issConds)).returning();

        res.json({ success: true, data: { id: invoice.id, status: 'issued' } });
    } catch (error) {
        next(error);
    }
});

// Approve tax invoice (maker/checker) — HQ/admin only
documentRoutes.patch('/tax-invoices/:id/approve', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const roleLevel = req.authUser?.roleLevel ?? 7;
        if (!req.authUser?.isSuperAdmin && roleLevel > 4) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only HQ admins or above can approve tax invoices' } });
        }
        const tenantId = req.authUser?.tenantId;
        const conds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'TAX_INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) conds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...conds) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tax invoice not found' } });
        if (!['PENDING_APPROVAL', 'PENDING'].includes(existing.status)) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Tax invoice is already ${existing.status}` } });
        }
        const existingData = existing.data as Record<string, unknown>;
        const [invoice] = await db.update(documents).set({
            status: 'ISSUED',
            data: { ...existingData, issuedAt: new Date().toISOString(), issuedBy: req.authUser?.userId },
            updatedAt: new Date(),
        }).where(and(...conds)).returning();
        res.json({ success: true, data: { id: invoice.id, status: 'issued' } });
    } catch (error) {
        next(error);
    }
});

// Reject tax invoice (maker/checker) — HQ/admin only
documentRoutes.patch('/tax-invoices/:id/reject', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const roleLevel = req.authUser?.roleLevel ?? 7;
        if (!req.authUser?.isSuperAdmin && roleLevel > 4) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only HQ admins or above can reject tax invoices' } });
        }
        const { reason } = req.body;
        const tenantId = req.authUser?.tenantId;
        const conds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'TAX_INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) conds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...conds) });
        if (!existing) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tax invoice not found' } });
        if (!['PENDING_APPROVAL', 'PENDING'].includes(existing.status)) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_STATE', message: `Tax invoice is already ${existing.status}` } });
        }
        const existingData = existing.data as Record<string, unknown>;
        const [invoice] = await db.update(documents).set({
            status: 'CANCELLED',
            data: { ...existingData, rejectionReason: reason, rejectedBy: req.authUser?.userId },
            updatedAt: new Date(),
        }).where(and(...conds)).returning();
        res.json({ success: true, data: { id: invoice.id, status: 'cancelled' } });
    } catch (error) {
        next(error);
    }
});

// Cancel tax invoice (scope-checked)
documentRoutes.put('/tax-invoices/:id/cancel', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        // BE-74: Tenant-scoped tax invoice cancel
        const tenantId = req.authUser?.tenantId;
        const canConds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'TAX_INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) canConds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...canConds) });

        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tax invoice not found or no access' } });
        }

        if (!ensureScopeAccess(existing, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        const existingData = existing.data as Record<string, unknown>;

        const [invoice] = await db.update(documents).set({
            status: 'CANCELLED',
            data: { ...existingData, cancelledAt: new Date().toISOString(), cancelledBy: req.user!.userId },
            updatedAt: new Date(),
        }).where(and(...canConds)).returning();

        res.json({ success: true, data: { id: invoice.id, status: 'cancelled' } });
    } catch (error) {
        next(error);
    }
});

// Print tax invoice (scope-checked)
documentRoutes.get('/tax-invoices/:id/print', authenticate, async (req, res, next) => {
    try {
        // BE-74: Tenant-scoped tax invoice print
        const tenantId = req.authUser?.tenantId;
        const prtConds: any[] = [eq(documents.id, req.params.id), eq(documents.type, 'TAX_INVOICE')];
        if (tenantId && !req.authUser?.isSuperAdmin) prtConds.push(eq(documents.tenantId, tenantId));

        const invoice = await db.query.documents.findFirst({
            where: and(...prtConds),
        });

        if (!invoice) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tax invoice not found or no access' } });
        }

        if (!ensureScopeAccess(invoice, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        await db.update(documents).set({ printCount: sql`${documents.printCount} + 1` }).where(and(...prtConds));

        const storeSetting = await db.query.settings.findFirst({
            where: and(eq(settings.category, 'store'), eq(settings.key, 'info')),
        });

        const storeInfo = (storeSetting?.value || {}) as Record<string, unknown>;
        const docData = invoice.data as Record<string, unknown>;

        // Return print-ready data
        res.json({
            success: true,
            data: {
                invoice: {
                    invoiceNumber: invoice.documentNo,
                    customerName: docData?.customerName,
                    taxId: docData?.taxId,
                    subtotal: docData?.subtotal,
                    taxAmount: docData?.taxAmount,
                    total: docData?.total,
                    issuedAt: docData?.issuedAt,
                    createdAt: invoice.createdAt,
                },
                store: {
                    name: storeInfo?.name || 'KPOS',
                    address: storeInfo?.address || '',
                    phone: storeInfo?.phone || '',
                    taxId: storeInfo?.taxId || '',
                    logo: storeInfo?.logo || '',
                },
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVOICE SETTINGS (Logo, Templates, etc.)
// ═══════════════════════════════════════════════════════════════════════════

// Get invoice settings
documentRoutes.get('/settings', authenticate, async (req, res, next) => {
    try {
        const settingsRows = await db.query.settings.findMany({
            where: eq(settings.category, 'invoice'),
        });

        const settingsObj = settingsRows.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {} as Record<string, unknown>);

        // Default settings
        const defaultSettings = {
            logo: '',
            companyName: '',
            companyAddress: '',
            companyPhone: '',
            companyEmail: '',
            companyTaxId: '',
            invoicePrefix: 'INV',
            taxInvoicePrefix: 'TXI',
            defaultTaxRate: 10,
            footerText: 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ',
            showLogo: true,
            showQRCode: false,
            paperSize: 'A4',
        };

        res.json({
            success: true,
            data: { ...defaultSettings, ...settingsObj },
        });
    } catch (error) {
        next(error);
    }
});

// Update invoice settings
documentRoutes.put('/settings', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const settingsBody = req.body;

        for (const [key, value] of Object.entries(settingsBody)) {
            const existing = await db.query.settings.findFirst({
                where: and(eq(settings.category, 'invoice'), eq(settings.key, key), isNull(settings.branchId)),
            });
            if (existing) {
                await db.update(settings).set({ value: value as any, updatedAt: new Date() }).where(eq(settings.id, existing.id));
            } else {
                await db.insert(settings).values({ category: 'invoice', key, value: value as any });
            }
        }

        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        next(error);
    }
});
