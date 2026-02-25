// ═══════════════════════════════════════════════════════════════════════════
// Settings Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const settingRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.get('/', authenticate, async (req, res, next) => {
    try {
        const { category, branchId } = req.query;
        const targetBranchId = branchId ? String(branchId) : req.user!.branchId;

        const where: Record<string, unknown> = {};

        // Get both global settings (branchId = null) and branch-specific settings
        where.OR = [
            { branchId: null },
            { branchId: targetBranchId }
        ];

        if (category) where.category = String(category);

        const settings = await prisma.settings.findMany({
            where,
            orderBy: [{ category: 'asc' }, { key: 'asc' }]
        });

        // Group by category
        const grouped = settings.reduce((acc, s) => {
            if (!acc[s.category]) {
                acc[s.category] = {};
            }
            acc[s.category][s.key] = s.value;
            return acc;
        }, {} as Record<string, Record<string, unknown>>);

        res.json({ success: true, data: grouped });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET SETTINGS BY CATEGORY
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.get('/category/:category', authenticate, async (req, res, next) => {
    try {
        const { category } = req.params;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;

        const settings = await prisma.settings.findMany({
            where: {
                category,
                OR: [
                    { branchId: null },
                    { branchId }
                ]
            }
        });

        // Convert to key-value object
        const settingsObject = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {} as Record<string, unknown>);

        res.json({ success: true, data: settingsObject });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET SINGLE SETTING
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.get('/:category/:key', authenticate, async (req, res, next) => {
    try {
        const { category, key } = req.params;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;

        // First try branch-specific, then fallback to global
        let setting = await prisma.settings.findFirst({
            where: { category, key, branchId }
        });

        if (!setting) {
            setting = await prisma.settings.findFirst({
                where: { category, key, branchId: null }
            });
        }

        if (!setting) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Setting not found' }
            });
        }

        res.json({ success: true, data: setting });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE SETTING
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.put('/:category/:key', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { category, key } = req.params;
        const { value, isGlobal = false } = req.body;
        const isSuperOrAdmin = req.authUser?.isSuperAdmin || req.authUser?.role === 'admin';
        
        // Only super admins and admins can set global settings or modify other branches
        const effectiveGlobal = isGlobal && isSuperOrAdmin;
        const branchId = effectiveGlobal ? null : (isSuperOrAdmin && req.body.branchId ? req.body.branchId : req.user!.branchId);

        // Find existing setting
        const existing = await prisma.settings.findFirst({
            where: { category, key, branchId }
        });

        let setting;
        if (existing) {
            setting = await prisma.settings.update({
                where: { id: existing.id },
                data: { value }
            });
        } else {
            setting = await prisma.settings.create({
                data: { category, key, value, branchId }
            });
        }

        res.json({ success: true, data: setting });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK UPDATE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.post('/bulk', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { settings, isGlobal = false } = req.body;
        const isSuperOrAdmin = req.authUser?.isSuperAdmin || req.authUser?.role === 'admin';
        
        // Only super admins and admins can set global settings or modify other branches
        const effectiveGlobal = isGlobal && isSuperOrAdmin;
        const branchId = effectiveGlobal ? null : (isSuperOrAdmin && req.body.branchId ? req.body.branchId : req.user!.branchId);

        const results = [];

        for (const [category, values] of Object.entries(settings as Record<string, Record<string, unknown>>)) {
            for (const [key, value] of Object.entries(values)) {
                const existing = await prisma.settings.findFirst({
                    where: { category, key, branchId }
                });

                let setting;
                if (existing) {
                    setting = await prisma.settings.update({
                        where: { id: existing.id },
                        data: { value: value as any }
                    });
                } else {
                    setting = await prisma.settings.create({
                        data: { category, key, value: value as any, branchId }
                    });
                }
                results.push(setting);
            }
        }

        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE SETTING
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.delete('/:category/:key', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { category, key } = req.params;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;

        const existing = await prisma.settings.findFirst({
            where: { category, key, branchId }
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Setting not found' }
            });
        }

        await prisma.settings.delete({
            where: { id: existing.id }
        });

        res.json({ success: true, message: 'Setting deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET DEFAULT SETTINGS TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.get('/template/default', authenticate, authorize('settings:read'), async (_req, res) => {
    const defaultSettings = {
        store: {
            name: 'My Store',
            address: '',
            phone: '',
            taxId: '',
            logo: '',
            currency: 'LAK',
            currencySymbol: '₭',
            timezone: 'Asia/Vientiane',
        },
        pos: {
            defaultTaxRate: 10,
            enableTax: true,
            priceIncludesTax: true,
            allowNegativeStock: false,
            requireCustomer: false,
            defaultPaymentMethod: 'CASH',
            printReceipt: true,
            showProductImages: true,
        },
        receipt: {
            width: '80mm',
            showLogo: true,
            showTaxDetails: true,
            footerText: 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ!',
            paperSize: '80mm',
        },
        display: {
            theme: 'system',
            language: 'lo',
            showCustomerDisplay: false,
            customerDisplayUrl: '',
        },
        notifications: {
            lowStockAlert: true,
            lowStockThreshold: 10,
            emailNotifications: false,
            soundEnabled: true,
        },
    };

    res.json({ success: true, data: defaultSettings });
});

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZE DEFAULT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.post('/initialize', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const branchId = req.body.branchId || req.user!.branchId;

        const defaultSettings: Record<string, Record<string, unknown>> = {
            store: {
                name: 'My Store',
                currency: 'LAK',
                currencySymbol: '₭',
                timezone: 'Asia/Vientiane',
            },
            pos: {
                defaultTaxRate: 10,
                enableTax: true,
                priceIncludesTax: true,
                allowNegativeStock: false,
            },
            receipt: {
                width: '80mm',
                showLogo: true,
            },
            display: {
                theme: 'system',
                language: 'lo',
            },
        };

        const results = [];

        for (const [category, values] of Object.entries(defaultSettings)) {
            for (const [key, value] of Object.entries(values)) {
                const existing = await prisma.settings.findFirst({
                    where: { category, key, branchId }
                });

                if (!existing) {
                    const setting = await prisma.settings.create({
                        data: { category, key, value: value as any, branchId }
                    });
                    results.push(setting);
                }
            }
        }

        res.json({
            success: true,
            data: results,
            message: `${results.length} settings initialized`
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get integrations settings
settingRoutes.get('/integrations', authenticate, async (req, res, next) => {
    try {
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;
        
        const settings = await prisma.settings.findMany({
            where: {
                category: { in: ['integrations', 'integration'] },
                OR: [{ branchId: null }, { branchId }]
            }
        });
        
        // Return as array with id from key
        const integrations = settings.map(s => {
            const val = typeof s.value === 'string' ? JSON.parse(s.value) : s.value;
            return { id: s.key, ...(val as object) };
        });
        
        res.json({ success: true, data: integrations });
    } catch (error) {
        next(error);
    }
});

// Update integration settings
settingRoutes.put('/integrations/:integrationId', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { integrationId } = req.params;
        const { enabled, config } = req.body;
        const branchId = req.body.branchId || req.user!.branchId;
        
        const existing = await prisma.settings.findFirst({
            where: { category: 'integrations', key: integrationId, branchId }
        });
        
        const value = { enabled, config, updatedAt: new Date().toISOString() };
        
        let setting;
        if (existing) {
            setting = await prisma.settings.update({
                where: { id: existing.id },
                data: { value }
            });
        } else {
            setting = await prisma.settings.create({
                data: { category: 'integrations', key: integrationId, value, branchId }
            });
        }
        
        res.json({ success: true, data: setting });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// RECEIPT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

// Get receipt settings
settingRoutes.get('/receipt', authenticate, async (req, res, next) => {
    try {
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;
        
        const settings = await prisma.settings.findMany({
            where: {
                category: 'receipt',
                OR: [{ branchId: null }, { branchId }]
            }
        });
        
        // Convert to object
        const receipt = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {} as Record<string, unknown>);
        
        res.json({ success: true, data: receipt });
    } catch (error) {
        next(error);
    }
});

// Update receipt settings
settingRoutes.put('/receipt', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const branchId = req.body.branchId || req.user!.branchId;
        const receiptSettings = req.body;
        
        const results = [];
        
        for (const [key, value] of Object.entries(receiptSettings)) {
            if (key === 'branchId') continue;
            
            const existing = await prisma.settings.findFirst({
                where: { category: 'receipt', key, branchId }
            });
            
            let setting;
            if (existing) {
                setting = await prisma.settings.update({
                    where: { id: existing.id },
                    data: { value: value as any }
                });
            } else {
                setting = await prisma.settings.create({
                    data: { category: 'receipt', key, value: value as any, branchId }
                });
            }
            results.push(setting);
        }
        
        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TAXES
// ═══════════════════════════════════════════════════════════════════════════

// Get all taxes
settingRoutes.get('/taxes', authenticate, async (req, res, next) => {
    try {
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;
        
        const settings = await prisma.settings.findMany({
            where: { category: 'tax', OR: [{ branchId: null }, { branchId }] }
        });
        
        // Convert settings to tax list format
        const taxList = settings
            .filter(s => s.key.startsWith('tax_'))
            .map(s => ({ id: s.id, ...((s.value || {}) as Record<string, unknown>) }));
        
        res.json({ success: true, data: taxList });
    } catch (error) {
        next(error);
    }
});

// Create tax
settingRoutes.post('/taxes', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const branchId = req.body.branchId || req.user!.branchId;
        const { name, rate, isActive = true, isDefault = false } = req.body;
        
        const key = `tax_${Date.now()}`;
        const setting = await prisma.settings.create({
            data: {
                category: 'tax',
                key,
                value: { name, rate, isActive, isDefault } as any,
                branchId
            }
        });
        
        res.status(201).json({ success: true, data: { id: setting.id, name, rate, isActive, isDefault } });
    } catch (error) {
        next(error);
    }
});

// Update tax
settingRoutes.put('/taxes/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { name, rate, isActive, isDefault } = req.body;
        
        const existing = await prisma.settings.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tax not found' } });
        }
        
        const currentValue = (existing.value || {}) as Record<string, unknown>;
        const updatedValue = {
            ...currentValue,
            ...(name !== undefined && { name }),
            ...(rate !== undefined && { rate }),
            ...(isActive !== undefined && { isActive }),
            ...(isDefault !== undefined && { isDefault }),
        };
        
        await prisma.settings.update({
            where: { id: req.params.id },
            data: { value: updatedValue as any }
        });
        
        res.json({ success: true, data: { id: req.params.id, ...updatedValue } });
    } catch (error) {
        next(error);
    }
});

// Delete tax
settingRoutes.delete('/taxes/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        await prisma.settings.delete({ where: { id: req.params.id } });
        res.json({ success: true, data: { message: 'Tax deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PRINTERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all printers
settingRoutes.get('/printers', authenticate, async (req, res, next) => {
    try {
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;
        
        const settings = await prisma.settings.findMany({
            where: { category: 'printer', OR: [{ branchId: null }, { branchId }] }
        });
        
        const printers = settings
            .filter(s => s.key.startsWith('printer_'))
            .map(s => ({ id: s.id, ...((s.value || {}) as Record<string, unknown>) }));
        
        res.json({ success: true, data: printers });
    } catch (error) {
        next(error);
    }
});

// Create printer
settingRoutes.post('/printers', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const branchId = req.body.branchId || req.user!.branchId;
        const { name, type, connectionType, address, port, isDefault = false, isActive = true } = req.body;
        
        const key = `printer_${Date.now()}`;
        const value = { name, type, connectionType, address, port, isDefault, isActive };
        
        const setting = await prisma.settings.create({
            data: { category: 'printer', key, value: value as any, branchId }
        });
        
        res.status(201).json({ success: true, data: { id: setting.id, ...value } });
    } catch (error) {
        next(error);
    }
});

// Update printer
settingRoutes.put('/printers/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const existing = await prisma.settings.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Printer not found' } });
        }
        
        const currentValue = (existing.value || {}) as Record<string, unknown>;
        const updatedValue = { ...currentValue, ...req.body };
        delete (updatedValue as any).branchId;
        
        await prisma.settings.update({
            where: { id: req.params.id },
            data: { value: updatedValue as any }
        });
        
        res.json({ success: true, data: { id: req.params.id, ...updatedValue } });
    } catch (error) {
        next(error);
    }
});

// Test printer
settingRoutes.post('/printers/:id/test', authenticate, async (req, res, next) => {
    try {
        const existing = await prisma.settings.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Printer not found' } });
        }
        
        // In production, this would send a test print to the actual printer
        res.json({ success: true, data: { message: 'Test print sent' } });
    } catch (error) {
        next(error);
    }
});

// Delete printer
settingRoutes.delete('/printers/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        await prisma.settings.delete({ where: { id: req.params.id } });
        res.json({ success: true, data: { message: 'Printer deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get notification settings
settingRoutes.get('/notifications', authenticate, async (req, res, next) => {
    try {
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;
        
        const settings = await prisma.settings.findMany({
            where: { category: 'notifications', OR: [{ branchId: null }, { branchId }] }
        });
        
        const notifSettings = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {} as Record<string, unknown>);
        
        // Return defaults if nothing set
        const defaults = {
            lowStockAlert: true,
            lowStockThreshold: 10,
            emailNotifications: false,
            soundEnabled: true,
            ...notifSettings,
        };
        
        res.json({ success: true, data: defaults });
    } catch (error) {
        next(error);
    }
});

// Update notification settings
settingRoutes.put('/notifications', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const branchId = req.body.branchId || req.user!.branchId;
        const notifSettings = req.body;
        
        const results = [];
        for (const [key, value] of Object.entries(notifSettings)) {
            if (key === 'branchId') continue;
            
            const existing = await prisma.settings.findFirst({
                where: { category: 'notifications', key, branchId }
            });
            
            let setting;
            if (existing) {
                setting = await prisma.settings.update({
                    where: { id: existing.id },
                    data: { value: value as any }
                });
            } else {
                setting = await prisma.settings.create({
                    data: { category: 'notifications', key, value: value as any, branchId }
                });
            }
            results.push(setting);
        }
        
        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

// Get all documents
settingRoutes.get('/documents', authenticate, async (req, res, next) => {
    try {
        const { type, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};
        if (type) where.type = String(type);
        if (status) where.status = String(status);

        const [documents, total] = await Promise.all([
            prisma.document.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.document.count({ where }),
        ]);

        res.json({
            success: true,
            data: documents,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get document by ID
settingRoutes.get('/documents/:id', authenticate, async (req, res, next) => {
    try {
        const document = await prisma.document.findUnique({
            where: { id: req.params.id },
        });

        if (!document) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Document not found' } });
            return;
        }

        res.json({ success: true, data: document });
    } catch (error) {
        next(error);
    }
});

// Create document
settingRoutes.post('/documents', authenticate, async (req, res, next) => {
    try {
        const { type, referenceId, referenceType, data } = req.body;

        // Generate document number
        const prefix = type === 'RECEIPT' ? 'RCP' : type === 'INVOICE' ? 'INV' : type === 'TAX_INVOICE' ? 'TXI' : 'DOC';
        const count = await prisma.document.count({ where: { type } });
        const documentNo = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(5, '0')}`;

        const document = await prisma.document.create({
            data: {
                type,
                documentNo,
                referenceId,
                referenceType,
                data,
            },
        });

        res.status(201).json({ success: true, data: document });
    } catch (error) {
        next(error);
    }
});

// Update document status
settingRoutes.patch('/documents/:id/status', authenticate, async (req, res, next) => {
    try {
        const { status } = req.body;

        const document = await prisma.document.update({
            where: { id: req.params.id },
            data: { 
                status,
                printCount: status === 'PRINTED' ? { increment: 1 } : undefined,
            },
        });

        res.json({ success: true, data: document });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

// Get all document templates
settingRoutes.get('/document-templates', authenticate, async (req, res, next) => {
    try {
        const templates = await prisma.documentTemplate.findMany({
            orderBy: { type: 'asc' },
        });

        res.json({ success: true, data: templates });
    } catch (error) {
        next(error);
    }
});

// Get template by type
settingRoutes.get('/document-templates/:type', authenticate, async (req, res, next) => {
    try {
        const template = await prisma.documentTemplate.findUnique({
            where: { type: req.params.type },
        });

        if (!template) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Template not found' } });
            return;
        }

        res.json({ success: true, data: template });
    } catch (error) {
        next(error);
    }
});

// Create/Update document template
settingRoutes.put('/document-templates/:type', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { type } = req.params;
        const { name, template, settings } = req.body;

        const docTemplate = await prisma.documentTemplate.upsert({
            where: { type },
            update: { name, template, settings },
            create: { type, name, template, settings },
        });

        res.json({ success: true, data: docTemplate });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// USER NOTIFICATIONS (Notification model CRUD)
// ═══════════════════════════════════════════════════════════════════════════

// Get current user's notifications
settingRoutes.get('/user-notifications', authenticate, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const { page = 1, limit = 20, unreadOnly } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = { userId };
        if (unreadOnly === 'true') where.isRead = false;

        const [notifications, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.notification.count({ where }),
            prisma.notification.count({ where: { userId, isRead: false } }),
        ]);

        res.json({
            success: true,
            data: notifications,
            unreadCount,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Mark all notifications as read (MUST be before :id/read to avoid matching 'mark-all-read' as :id)
settingRoutes.put('/user-notifications/mark-all-read', authenticate, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true, readAt: new Date() },
        });

        res.json({ success: true, data: { message: 'ອ່ານທັງໝົດແລ້ວ' } });
    } catch (error) {
        next(error);
    }
});

// Mark notification as read
settingRoutes.put('/user-notifications/:id/read', authenticate, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const notification = await prisma.notification.findFirst({
            where: { id: req.params.id, userId },
        });

        if (!notification) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບການແຈ້ງເຕືອນ' } });
        }

        const updated = await prisma.notification.update({
            where: { id: req.params.id },
            data: { isRead: true, readAt: new Date() },
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

// Delete a notification
settingRoutes.delete('/user-notifications/:id', authenticate, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const notification = await prisma.notification.findFirst({
            where: { id: req.params.id, userId },
        });

        if (!notification) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບການແຈ້ງເຕືອນ' } });
        }

        await prisma.notification.delete({ where: { id: req.params.id } });
        res.json({ success: true, data: { message: 'ລຶບແລ້ວ' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// Get all API keys (stored as settings with category 'api_key')
settingRoutes.get('/api-keys', authenticate, authorize('settings:read'), async (req, res, next) => {
    try {
        const branchId = req.user!.branchId;
        const settings = await prisma.settings.findMany({
            where: { category: 'api_key', OR: [{ branchId: null }, { branchId }] },
            orderBy: { createdAt: 'desc' },
        });

        const keys = settings.map(s => {
            const val = typeof s.value === 'string' ? JSON.parse(s.value) : s.value as Record<string, unknown>;
            return {
                id: s.id,
                name: s.key,
                service: (val as any).service || '',
                apiKey: (val as any).apiKey || '',
                secretKey: (val as any).secretKey || '',
                isActive: (val as any).isActive !== false,
                lastUsed: (val as any).lastUsed || null,
                createdAt: s.createdAt,
            };
        });

        res.json({ success: true, data: keys });
    } catch (error) {
        next(error);
    }
});

// Create API key
settingRoutes.post('/api-keys', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { name, service, apiKey, secretKey } = req.body;
        const branchId = req.user!.branchId;

        const existing = await prisma.settings.findFirst({
            where: { category: 'api_key', key: name, branchId },
        });
        if (existing) {
            return res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'API key name already exists' } });
        }

        const setting = await prisma.settings.create({
            data: {
                category: 'api_key',
                key: name,
                value: JSON.stringify({ service, apiKey, secretKey, isActive: true }),
                branchId,
            },
        });

        res.status(201).json({
            success: true,
            data: { id: setting.id, name, service, apiKey, secretKey, isActive: true, createdAt: setting.createdAt },
        });
    } catch (error) {
        next(error);
    }
});

// Update API key
settingRoutes.put('/api-keys/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { name, service, apiKey, secretKey, isActive } = req.body;
        const existing = await prisma.settings.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
        }

        const currentVal = typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value as Record<string, unknown>;
        const updated = await prisma.settings.update({
            where: { id: req.params.id },
            data: {
                key: name || existing.key,
                value: JSON.stringify({
                    service: service ?? (currentVal as any).service,
                    apiKey: apiKey ?? (currentVal as any).apiKey,
                    secretKey: secretKey ?? (currentVal as any).secretKey,
                    isActive: isActive !== undefined ? isActive : (currentVal as any).isActive,
                    lastUsed: (currentVal as any).lastUsed,
                }),
            },
        });

        res.json({ success: true, data: { id: updated.id, name: updated.key } });
    } catch (error) {
        next(error);
    }
});

// Delete API key
settingRoutes.delete('/api-keys/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const existing = await prisma.settings.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
        }
        await prisma.settings.delete({ where: { id: req.params.id } });
        res.json({ success: true, data: { message: 'Deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATIONS (connect/disconnect)
// ═══════════════════════════════════════════════════════════════════════════

settingRoutes.post('/integrations/:id/connect', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const branchId = req.user!.branchId;
        const existing = await prisma.settings.findFirst({
            where: { category: 'integration', key: req.params.id, branchId },
        });
        const data = { connected: true, lastSync: new Date().toISOString(), ...req.body };
        if (existing) {
            await prisma.settings.update({ where: { id: existing.id }, data: { value: JSON.stringify(data) } });
        } else {
            await prisma.settings.create({ data: { category: 'integration', key: req.params.id, value: JSON.stringify(data), branchId } });
        }
        res.json({ success: true, data: { id: req.params.id, connected: true } });
    } catch (error) {
        next(error);
    }
});

settingRoutes.post('/integrations/:id/disconnect', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const branchId = req.user!.branchId;
        const existing = await prisma.settings.findFirst({
            where: { category: 'integration', key: req.params.id, branchId },
        });
        if (existing) {
            const val = typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value as Record<string, unknown>;
            await prisma.settings.update({ where: { id: existing.id }, data: { value: JSON.stringify({ ...(val as object), connected: false }) } });
        }
        res.json({ success: true, data: { id: req.params.id, connected: false } });
    } catch (error) {
        next(error);
    }
});
