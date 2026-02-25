// ═══════════════════════════════════════════════════════════════════════════
// Documents Module - Routes (Invoices & Tax Invoices)
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter, applyScopeFilter, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

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
        const filter = (req as any).branchFilter as ScopeFilter | undefined;

        const where: Record<string, unknown> = {
            type: 'INVOICE',
        };
        applyScopeFilter(where, filter, 'storeId');

        if (status && status !== 'all') {
            where.status = String(status).toUpperCase();
        }

        if (search) {
            where.OR = [
                { documentNo: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        if (from || to) {
            where.createdAt = {};
            if (from) (where.createdAt as Record<string, unknown>).gte = new Date(String(from));
            if (to) (where.createdAt as Record<string, unknown>).lte = new Date(String(to) + 'T23:59:59');
        }

        const [invoices, total] = await Promise.all([
            prisma.document.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.document.count({ where }),
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

// Get invoice by ID
documentRoutes.get('/invoices/:id', authenticate, async (req, res, next) => {
    try {
        const invoice = await prisma.document.findFirst({
            where: { id: req.params.id, type: 'INVOICE' },
        });

        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Invoice not found' },
            });
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
documentRoutes.post('/invoices', authenticate, authorize('documents:create'), async (req, res, next) => {
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

        // Generate invoice number
        const count = await prisma.document.count({ where: { type: 'INVOICE' } });
        const invoiceNo = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;

        const invoice = await prisma.document.create({
            data: {
                type: 'INVOICE',
                documentNo: invoiceNo,
                referenceId: req.user!.userId,
                referenceType: 'USER',
                status: 'PENDING',
                branchId: (req as any).authUser?.activeBranchId || null,
                storeId: (req as any).authUser?.activeStoreId || null,
                data: {
                    customerId,
                    customer: {
                        name: customerName,
                        email: customerEmail,
                        phone: customerPhone,
                        address: customerAddress,
                    },
                    items: items || [],
                    subtotal: subtotal || 0,
                    tax: tax || 0,
                    total: total || 0,
                    dueDate,
                    notes,
                    createdBy: req.user!.userId,
                },
            },
        });

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
        const existing = await prisma.document.findFirst({
            where: { id: req.params.id, type: 'INVOICE' },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Invoice not found' },
            });
        }

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

        const existingData = existing.data as Record<string, unknown>;

        const invoice = await prisma.document.update({
            where: { id: req.params.id },
            data: {
                data: {
                    ...existingData,
                    customerId,
                    customer: {
                        name: customerName,
                        email: customerEmail,
                        phone: customerPhone,
                        address: customerAddress,
                    },
                    items: items || existingData.items,
                    subtotal: subtotal ?? existingData.subtotal,
                    tax: tax ?? existingData.tax,
                    total: total ?? existingData.total,
                    dueDate,
                    notes,
                    updatedBy: req.user!.userId,
                },
            },
        });

        res.json({ success: true, data: { id: invoice.id } });
    } catch (error) {
        next(error);
    }
});

// Delete invoice
documentRoutes.delete('/invoices/:id', authenticate, authorize('documents:delete'), async (req, res, next) => {
    try {
        const existing = await prisma.document.findFirst({
            where: { id: req.params.id, type: 'INVOICE' },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Invoice not found' },
            });
        }

        await prisma.document.delete({ where: { id: req.params.id } });

        res.json({ success: true, message: 'Invoice deleted' });
    } catch (error) {
        next(error);
    }
});

// Mark invoice as paid
documentRoutes.put('/invoices/:id/mark-paid', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const invoice = await prisma.document.update({
            where: { id: req.params.id },
            data: { status: 'PAID' },
        });

        res.json({ success: true, data: { id: invoice.id, status: 'paid' } });
    } catch (error) {
        next(error);
    }
});

// Send invoice
documentRoutes.post('/invoices/:id/send', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const invoice = await prisma.document.update({
            where: { id: req.params.id },
            data: { status: 'SENT' },
        });

        // TODO: Implement email sending

        res.json({ success: true, data: { id: invoice.id, status: 'sent' } });
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
        const filter = (req as any).branchFilter as ScopeFilter | undefined;

        const where: Record<string, unknown> = {
            type: 'TAX_INVOICE',
        };
        applyScopeFilter(where, filter, 'storeId');

        if (status && status !== 'all') {
            where.status = String(status).toUpperCase();
        }

        if (search) {
            where.OR = [
                { documentNo: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        if (from || to) {
            where.createdAt = {};
            if (from) (where.createdAt as Record<string, unknown>).gte = new Date(String(from));
            if (to) (where.createdAt as Record<string, unknown>).lte = new Date(String(to) + 'T23:59:59');
        }

        const [invoices, total] = await Promise.all([
            prisma.document.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.document.count({ where }),
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

// Get tax invoice by ID
documentRoutes.get('/tax-invoices/:id', authenticate, async (req, res, next) => {
    try {
        const invoice = await prisma.document.findFirst({
            where: { id: req.params.id, type: 'TAX_INVOICE' },
        });

        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tax invoice not found' },
            });
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
documentRoutes.post('/tax-invoices', authenticate, authorize('documents:create'), async (req, res, next) => {
    try {
        const { customerName, taxId, orderId, subtotal, taxAmount, total } = req.body;

        // Generate tax invoice number
        const count = await prisma.document.count({ where: { type: 'TAX_INVOICE' } });
        const invoiceNumber = `TXI-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;

        const invoice = await prisma.document.create({
            data: {
                type: 'TAX_INVOICE',
                documentNo: invoiceNumber,
                referenceId: req.user!.userId,
                referenceType: 'USER',
                status: 'PENDING',
                branchId: (req as any).authUser?.activeBranchId || null,
                storeId: (req as any).authUser?.activeStoreId || null,
                data: {
                    customerName,
                    taxId,
                    orderId,
                    subtotal: subtotal || 0,
                    taxAmount: taxAmount || 0,
                    total: total || 0,
                    createdBy: req.user!.userId,
                },
            },
        });

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

// Update tax invoice
documentRoutes.put('/tax-invoices/:id', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const existing = await prisma.document.findFirst({
            where: { id: req.params.id, type: 'TAX_INVOICE' },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tax invoice not found' },
            });
        }

        const { customerName, taxId, orderId, subtotal, taxAmount, total } = req.body;
        const existingData = existing.data as Record<string, unknown>;

        const invoice = await prisma.document.update({
            where: { id: req.params.id },
            data: {
                data: {
                    ...existingData,
                    customerName,
                    taxId,
                    orderId,
                    subtotal: subtotal ?? existingData.subtotal,
                    taxAmount: taxAmount ?? existingData.taxAmount,
                    total: total ?? existingData.total,
                    updatedBy: req.user!.userId,
                },
            },
        });

        res.json({ success: true, data: { id: invoice.id } });
    } catch (error) {
        next(error);
    }
});

// Delete tax invoice
documentRoutes.delete('/tax-invoices/:id', authenticate, authorize('documents:delete'), async (req, res, next) => {
    try {
        const existing = await prisma.document.findFirst({
            where: { id: req.params.id, type: 'TAX_INVOICE' },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tax invoice not found' },
            });
        }

        await prisma.document.delete({ where: { id: req.params.id } });

        res.json({ success: true, message: 'Tax invoice deleted' });
    } catch (error) {
        next(error);
    }
});

// Issue tax invoice
documentRoutes.put('/tax-invoices/:id/issue', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const existing = await prisma.document.findFirst({
            where: { id: req.params.id, type: 'TAX_INVOICE' },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tax invoice not found' },
            });
        }

        const existingData = existing.data as Record<string, unknown>;

        const invoice = await prisma.document.update({
            where: { id: req.params.id },
            data: {
                status: 'ISSUED',
                data: {
                    ...existingData,
                    issuedAt: new Date().toISOString(),
                    issuedBy: req.user!.userId,
                },
            },
        });

        res.json({ success: true, data: { id: invoice.id, status: 'issued' } });
    } catch (error) {
        next(error);
    }
});

// Cancel tax invoice
documentRoutes.put('/tax-invoices/:id/cancel', authenticate, authorize('documents:update'), async (req, res, next) => {
    try {
        const existing = await prisma.document.findFirst({
            where: { id: req.params.id, type: 'TAX_INVOICE' },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tax invoice not found' },
            });
        }

        const existingData = existing.data as Record<string, unknown>;

        const invoice = await prisma.document.update({
            where: { id: req.params.id },
            data: {
                status: 'CANCELLED',
                data: {
                    ...existingData,
                    cancelledAt: new Date().toISOString(),
                    cancelledBy: req.user!.userId,
                },
            },
        });

        res.json({ success: true, data: { id: invoice.id, status: 'cancelled' } });
    } catch (error) {
        next(error);
    }
});

// Print tax invoice (return HTML for printing)
documentRoutes.get('/tax-invoices/:id/print', authenticate, async (req, res, next) => {
    try {
        const invoice = await prisma.document.findFirst({
            where: { id: req.params.id, type: 'TAX_INVOICE' },
        });

        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tax invoice not found' },
            });
        }

        // Increment print count
        await prisma.document.update({
            where: { id: req.params.id },
            data: { printCount: { increment: 1 } },
        });

        // Get store settings for logo
        const storeSetting = await prisma.settings.findFirst({
            where: { category: 'store', key: 'info' },
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
        const settings = await prisma.settings.findMany({
            where: { category: 'invoice' },
        });

        const settingsObj = settings.reduce((acc, s) => {
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
        const settings = req.body;

        for (const [key, value] of Object.entries(settings)) {
            await prisma.settings.upsert({
                where: {
                    category_key_branchId: {
                        category: 'invoice',
                        key,
                        branchId: null as any,
                    },
                },
                create: {
                    category: 'invoice',
                    key,
                    value: value as any,
                },
                update: {
                    value: value as any,
                },
            });
        }

        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        next(error);
    }
});
