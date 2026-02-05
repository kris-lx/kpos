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
        const branchId = isGlobal ? null : (req.body.branchId || req.user!.branchId);

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
        const branchId = isGlobal ? null : (req.body.branchId || req.user!.branchId);

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
                category: 'integrations',
                OR: [{ branchId: null }, { branchId }]
            }
        });
        
        // Convert to object
        const integrations = settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {} as Record<string, unknown>);
        
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
