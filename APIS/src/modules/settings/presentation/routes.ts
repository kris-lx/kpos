// ═══════════════════════════════════════════════════════════════════════════
// Settings Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize } from '@/infrastructure/http/middleware/auth.middleware';
import { db } from '@/config/database.config';
import { settings, documents, documentTemplates, notifications, systemEnums } from '@/db/schema/tables';
import { eq, and, or, isNull, inArray, desc, asc, count, sql } from 'drizzle-orm';

export const settingRoutes = Router();

// Helper: find or create a setting
async function upsertSetting(category: string, key: string, value: any, branchId: string | null) {
    const conditions = [eq(settings.category, category), eq(settings.key, key)];
    conditions.push(branchId ? eq(settings.branchId, branchId) : isNull(settings.branchId));
    const existing = await db.query.settings.findFirst({ where: and(...conditions) });
    if (existing) {
        const [updated] = await db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.id, existing.id)).returning();
        return updated;
    }
    const [created] = await db.insert(settings).values({ category, key, value, branchId }).returning();
    return created;
}

// Helper: get settings with branch fallback (global + branch-specific)
async function getSettingsForBranch(category: string, branchId: string) {
    return db.query.settings.findMany({
        where: and(
            eq(settings.category, category),
            or(isNull(settings.branchId), eq(settings.branchId, branchId)),
        ),
    });
}

// Helper: get settings for multiple categories with branch fallback
async function getSettingsForBranchMultiCategory(categories: string[], branchId: string) {
    return db.query.settings.findMany({
        where: and(
            inArray(settings.category, categories),
            or(isNull(settings.branchId), eq(settings.branchId, branchId)),
        ),
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// GET ENUMS (dropdown values for UI) - reads from DB, falls back to defaults
// ═══════════════════════════════════════════════════════════════════════════

// Hardcoded seed defaults used as fallback and for initial DB seeding
export const ENUM_SEED_DATA: Record<string, { value: string; label: string; labelLao?: string; isSystem?: boolean }[]> = {
    stockout_reason: [
        { value: 'damaged', label: 'Damaged', labelLao: 'ເສຍຫາຍ', isSystem: true },
        { value: 'expired', label: 'Expired', labelLao: 'ໝົດອາຍຸ', isSystem: true },
        { value: 'lost', label: 'Lost/Missing', labelLao: 'ສູນຫາຍ', isSystem: true },
        { value: 'returned', label: 'Returned to Vendor', labelLao: 'ສົ່ງຄືນຜູ້ສະໜອງ', isSystem: true },
        { value: 'internal_use', label: 'Internal Use', labelLao: 'ໃຊ້ພາຍໃນ', isSystem: true },
        { value: 'theft', label: 'Theft', labelLao: 'ຖືກລັກ', isSystem: true },
        { value: 'transfer', label: 'Transfer', labelLao: 'ໂອນຍ້າຍ', isSystem: true },
        { value: 'other', label: 'Other', labelLao: 'ອື່ນໆ', isSystem: true },
    ],
    adjust_reason: [
        { value: 'count_correction', label: 'Count Correction', labelLao: 'ແກ້ໄຂຈຳນວນ', isSystem: true },
        { value: 'damaged', label: 'Damaged', labelLao: 'ເສຍຫາຍ', isSystem: true },
        { value: 'expired', label: 'Expired', labelLao: 'ໝົດອາຍຸ', isSystem: true },
        { value: 'recount', label: 'Recount', labelLao: 'ນັບຄືນ', isSystem: true },
        { value: 'received', label: 'Received Stock', labelLao: 'ຮັບສິນຄ້າ', isSystem: true },
        { value: 'production', label: 'Production', labelLao: 'ຜະລິດ', isSystem: true },
        { value: 'other', label: 'Other', labelLao: 'ອື່ນໆ', isSystem: true },
    ],
    promotion_type: [
        { value: 'PERCENTAGE', label: 'Percentage Discount', labelLao: 'ສ່ວນຫຼຸດເປີເຊັນ', isSystem: true },
        { value: 'FIXED', label: 'Fixed Amount', labelLao: 'ສ່ວນຫຼຸດເງິນ', isSystem: true },
        { value: 'BUY_X_GET_Y', label: 'Buy X Get Y', labelLao: 'ຊື້ X ແຖມ Y', isSystem: true },
        { value: 'BUNDLE', label: 'Bundle Deal', labelLao: 'ຊຸດໂປຣໂມຊັ່ນ', isSystem: true },
    ],
    coupon_type: [
        { value: 'PERCENTAGE', label: 'Percentage Discount', labelLao: 'ສ່ວນຫຼຸດເປີເຊັນ', isSystem: true },
        { value: 'FIXED', label: 'Fixed Amount', labelLao: 'ສ່ວນຫຼຸດເງິນ', isSystem: true },
    ],
    discount_type: [
        { value: 'PERCENTAGE', label: 'Percentage Discount', labelLao: 'ສ່ວນຫຼຸດເປີເຊັນ', isSystem: true },
        { value: 'FIXED', label: 'Fixed Amount', labelLao: 'ສ່ວນຫຼຸດເງິນ', isSystem: true },
    ],
    gender: [
        { value: 'male', label: 'Male', labelLao: 'ຊາຍ', isSystem: true },
        { value: 'female', label: 'Female', labelLao: 'ຍິງ', isSystem: true },
        { value: 'other', label: 'Other', labelLao: 'ອື່ນໆ', isSystem: true },
    ],
    payment_method: [
        { value: 'cash', label: 'Cash', labelLao: 'ເງິນສົດ', isSystem: true },
        { value: 'card', label: 'Card', labelLao: 'ບັດ', isSystem: true },
        { value: 'transfer', label: 'Bank Transfer', labelLao: 'ໂອນເງິນ', isSystem: true },
        { value: 'qr', label: 'QR Payment', labelLao: 'ຈ່າຍຜ່ານ QR', isSystem: true },
        { value: 'wallet', label: 'E-Wallet', labelLao: 'ກະເປົາເງິນ', isSystem: true },
    ],
    business_type: [
        { value: 'retail', label: 'Retail Shop', labelLao: 'ຮ້ານຂາຍຍ່ອຍ', isSystem: true },
        { value: 'restaurant', label: 'Restaurant', labelLao: 'ຮ້ານອາຫານ', isSystem: true },
        { value: 'cafe', label: 'Cafe / Coffee Shop', labelLao: 'ຮ້ານກາເຟ', isSystem: true },
        { value: 'grocery', label: 'Grocery / Convenience', labelLao: 'ຮ້ານຂາຍເຄື່ອງ', isSystem: true },
        { value: 'pharmacy', label: 'Pharmacy', labelLao: 'ຮ້ານຂາຍຢາ', isSystem: true },
        { value: 'electronics', label: 'Electronics', labelLao: 'ຮ້ານເຄື່ອງໄຟຟ້າ', isSystem: true },
        { value: 'clothing', label: 'Clothing / Fashion', labelLao: 'ຮ້ານເຄື່ອງນຸ່ງ', isSystem: true },
        { value: 'beauty', label: 'Beauty / Salon', labelLao: 'ຮ້ານເສີມສວຍ', isSystem: true },
        { value: 'bakery', label: 'Bakery', labelLao: 'ຮ້ານເຂົ້າໜົມ', isSystem: true },
        { value: 'hotel', label: 'Hotel / Guesthouse', labelLao: 'ໂຮງແຮມ / ເຮືອນພັກ', isSystem: true },
        { value: 'service', label: 'Service Business', labelLao: 'ທຸລະກິດບໍລິການ', isSystem: true },
        { value: 'wholesale', label: 'Wholesale', labelLao: 'ຂາຍສົ່ງ', isSystem: true },
        { value: 'other', label: 'Other', labelLao: 'ອື່ນໆ', isSystem: true },
    ],
    id_type: [
        { value: 'national_id', label: 'National ID', labelLao: 'ບັດປະຈຳຕົວ', isSystem: true },
        { value: 'passport', label: 'Passport', labelLao: 'ໜັງສືຜ່ານແດນ', isSystem: true },
        { value: 'family_book', label: 'Family Book', labelLao: 'ສຳມະໂນຄົວ', isSystem: true },
        { value: 'driving_license', label: 'Driving License', labelLao: 'ໃບຂັບຂີ່', isSystem: true },
    ],
    nationality: [
        { value: 'LAO', label: 'Lao', labelLao: 'ລາວ', isSystem: true },
        { value: 'THAI', label: 'Thai', labelLao: 'ໄທ', isSystem: true },
        { value: 'VIE', label: 'Vietnamese', labelLao: 'ຫວຽດນາມ', isSystem: true },
        { value: 'CHN', label: 'Chinese', labelLao: 'ຈີນ', isSystem: true },
        { value: 'OTHER', label: 'Other', labelLao: 'ອື່ນໆ', isSystem: true },
    ],
};

settingRoutes.get('/enums', authenticate, async (req, res, next) => {
    try {
        const { type } = req.query;
        const typeList = type ? String(type).split(',').map(t => t.trim()).filter(Boolean) : [];

        // Fetch from DB
        const rows = await db.query.systemEnums.findMany({
            where: typeList.length > 0 ? inArray(systemEnums.type, typeList) : undefined,
            orderBy: [asc(systemEnums.type), asc(systemEnums.order), asc(systemEnums.label)],
        });

        // If DB has data, use it; otherwise fall back to seed
        if (rows.length > 0) {
            // Group by type, only active
            const result: Record<string, any[]> = {};
            for (const row of rows.filter(r => r.isActive)) {
                if (!result[row.type]) result[row.type] = [];
                result[row.type].push({ value: row.value, label: row.label, labelLao: row.labelLao });
            }
            // If specific types requested, ensure all requested types exist (fall back to seed for missing)
            if (typeList.length > 0) {
                for (const t of typeList) {
                    if (!result[t] && ENUM_SEED_DATA[t]) result[t] = ENUM_SEED_DATA[t].map(e => ({ value: e.value, label: e.label, labelLao: e.labelLao }));
                }
                return res.json({ success: true, data: result });
            }
            return res.json({ success: true, data: result });
        }

        // Fallback: return hardcoded seed data
        if (typeList.length > 0) {
            const filtered: Record<string, any> = {};
            for (const t of typeList) {
                if (ENUM_SEED_DATA[t]) filtered[t] = ENUM_SEED_DATA[t].map(e => ({ value: e.value, label: e.label, labelLao: e.labelLao }));
            }
            return res.json({ success: true, data: filtered });
        }
        const allFallback: Record<string, any> = {};
        for (const [k, v] of Object.entries(ENUM_SEED_DATA)) {
            allFallback[k] = v.map(e => ({ value: e.value, label: e.label, labelLao: e.labelLao }));
        }
        res.json({ success: true, data: allFallback });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ENUMS (PUBLIC - no auth, for register page)
// ═══════════════════════════════════════════════════════════════════════════

settingRoutes.get('/enums/public', async (req, res, next) => {
    try {
        const { type } = req.query;
        const typeList = type ? String(type).split(',').map((t: string) => t.trim()).filter(Boolean) : [];

        const rows = await db.query.systemEnums.findMany({
            where: typeList.length > 0 ? inArray(systemEnums.type, typeList) : undefined,
            orderBy: [asc(systemEnums.type), asc(systemEnums.order), asc(systemEnums.label)],
        });

        if (rows.length > 0) {
            const result: Record<string, any[]> = {};
            for (const row of rows.filter((r: any) => r.isActive)) {
                if (!result[row.type]) result[row.type] = [];
                result[row.type].push({ value: row.value, label: row.label, labelLao: row.labelLao });
            }
            if (typeList.length > 0) {
                for (const t of typeList) {
                    if (!result[t] && ENUM_SEED_DATA[t]) result[t] = ENUM_SEED_DATA[t].map((e: any) => ({ value: e.value, label: e.label, labelLao: e.labelLao }));
                }
            }
            return res.json({ success: true, data: result });
        }

        // Fallback to seed
        const filtered: Record<string, any> = {};
        const keys = typeList.length > 0 ? typeList : Object.keys(ENUM_SEED_DATA);
        for (const t of keys) {
            if (ENUM_SEED_DATA[t]) filtered[t] = ENUM_SEED_DATA[t].map((e: any) => ({ value: e.value, label: e.label, labelLao: e.labelLao }));
        }
        res.json({ success: true, data: filtered });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.get('/', authenticate, async (req, res, next) => {
    try {
        const { category, branchId } = req.query;
        const targetBranchId = branchId ? String(branchId) : req.user!.branchId;

        const conditions: any[] = [or(isNull(settings.branchId), eq(settings.branchId, targetBranchId))];
        if (category) conditions.push(eq(settings.category, String(category)));

        const settingsRows = await db.query.settings.findMany({
            where: and(...conditions),
            orderBy: [asc(settings.category), asc(settings.key)],
        });

        // Group by category
        const grouped = settingsRows.reduce((acc, s) => {
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

        const settingsRows = await getSettingsForBranch(category, branchId);

        // Convert to key-value object
        const settingsObject = settingsRows.reduce((acc, s) => {
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
        let setting = await db.query.settings.findFirst({
            where: and(eq(settings.category, category), eq(settings.key, key), eq(settings.branchId, branchId)),
        });

        if (!setting) {
            setting = await db.query.settings.findFirst({
                where: and(eq(settings.category, category), eq(settings.key, key), isNull(settings.branchId)),
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

        const setting = await upsertSetting(category, key, value, branchId);

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
                const setting = await upsertSetting(category, key, value as any, branchId);
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

        const existing = await db.query.settings.findFirst({
            where: and(eq(settings.category, category), eq(settings.key, key), eq(settings.branchId, branchId)),
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Setting not found' }
            });
        }

        await db.delete(settings).where(eq(settings.id, existing.id));

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
                const existing = await db.query.settings.findFirst({
                    where: and(eq(settings.category, category), eq(settings.key, key), eq(settings.branchId, branchId)),
                });

                if (!existing) {
                    const [setting] = await db.insert(settings).values({ category, key, value: value as any, branchId }).returning();
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
        
        const settingsRows = await getSettingsForBranchMultiCategory(['integrations', 'integration'], branchId);
        
        // Return as array with id from key
        const integrations = settingsRows.map(s => {
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
        
        const value = { enabled, config, updatedAt: new Date().toISOString() };
        const setting = await upsertSetting('integrations', integrationId, value, branchId);
        
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
        
        const settingsRows = await getSettingsForBranch('receipt', branchId);
        
        // Convert to object
        const receipt = settingsRows.reduce((acc, s) => {
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
            
            const setting = await upsertSetting('receipt', key, value as any, branchId);
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
        
        const settingsRows = await getSettingsForBranch('tax', branchId);
        
        // Convert settings to tax list format
        const taxList = settingsRows
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
        const [setting] = await db.insert(settings).values({
            category: 'tax',
            key,
            value: { name, rate, isActive, isDefault } as any,
            branchId,
        }).returning();
        
        res.status(201).json({ success: true, data: { id: setting.id, name, rate, isActive, isDefault } });
    } catch (error) {
        next(error);
    }
});

// Update tax
settingRoutes.put('/taxes/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const { name, rate, isActive, isDefault } = req.body;
        
        const existing = await db.query.settings.findFirst({ where: eq(settings.id, req.params.id) });
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
        
        await db.update(settings).set({ value: updatedValue as any, updatedAt: new Date() }).where(eq(settings.id, req.params.id));
        
        res.json({ success: true, data: { id: req.params.id, ...updatedValue } });
    } catch (error) {
        next(error);
    }
});

// Delete tax
settingRoutes.delete('/taxes/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        await db.delete(settings).where(eq(settings.id, req.params.id));
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
        
        const settingsRows = await getSettingsForBranch('printer', branchId);
        
        const printers = settingsRows
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
        
        const [setting] = await db.insert(settings).values({ category: 'printer', key, value: value as any, branchId }).returning();
        
        res.status(201).json({ success: true, data: { id: setting.id, ...value } });
    } catch (error) {
        next(error);
    }
});

// Update printer
settingRoutes.put('/printers/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const existing = await db.query.settings.findFirst({ where: eq(settings.id, req.params.id) });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Printer not found' } });
        }
        
        const currentValue = (existing.value || {}) as Record<string, unknown>;
        const updatedValue = { ...currentValue, ...req.body };
        delete (updatedValue as any).branchId;
        
        await db.update(settings).set({ value: updatedValue as any, updatedAt: new Date() }).where(eq(settings.id, req.params.id));
        
        res.json({ success: true, data: { id: req.params.id, ...updatedValue } });
    } catch (error) {
        next(error);
    }
});

// Test printer
settingRoutes.post('/printers/:id/test', authenticate, async (req, res, next) => {
    try {
        const existing = await db.query.settings.findFirst({ where: eq(settings.id, req.params.id) });
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
        await db.delete(settings).where(eq(settings.id, req.params.id));
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
        
        const settingsRows = await getSettingsForBranch('notifications', branchId);
        
        const notifSettings = settingsRows.reduce((acc, s) => {
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
            
            const setting = await upsertSetting('notifications', key, value as any, branchId);
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

        const conditions: any[] = [];
        if (type) conditions.push(eq(documents.type, String(type)));
        if (status) conditions.push(eq(documents.status, String(status)));
        const docWhere = conditions.length > 0 ? and(...conditions) : undefined;

        const [docRows, [{ value: total }]] = await Promise.all([
            db.query.documents.findMany({
                where: docWhere,
                offset: skip,
                limit: Number(limit),
                orderBy: desc(documents.createdAt),
            }),
            db.select({ value: count() }).from(documents).where(docWhere),
        ]);

        res.json({
            success: true,
            data: docRows,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get document by ID
settingRoutes.get('/documents/:id', authenticate, async (req, res, next) => {
    try {
        const document = await db.query.documents.findFirst({
            where: eq(documents.id, req.params.id),
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
        const [{ value: docCount }] = await db.select({ value: count() }).from(documents).where(eq(documents.type, type));
        const documentNo = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(docCount + 1).padStart(5, '0')}`;

        const [document] = await db.insert(documents).values({
            type,
            documentNo,
            referenceId,
            referenceType,
            data,
        }).returning();

        res.status(201).json({ success: true, data: document });
    } catch (error) {
        next(error);
    }
});

// Update document status
settingRoutes.patch('/documents/:id/status', authenticate, async (req, res, next) => {
    try {
        const { status } = req.body;

        const setData: any = { status, updatedAt: new Date() };
        if (status === 'PRINTED') setData.printCount = sql`${documents.printCount} + 1`;

        const [document] = await db.update(documents)
            .set(setData)
            .where(eq(documents.id, req.params.id))
            .returning();

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
        const templates = await db.query.documentTemplates.findMany({
            orderBy: asc(documentTemplates.type),
        });

        res.json({ success: true, data: templates });
    } catch (error) {
        next(error);
    }
});

// Get template by type
settingRoutes.get('/document-templates/:type', authenticate, async (req, res, next) => {
    try {
        const template = await db.query.documentTemplates.findFirst({
            where: eq(documentTemplates.type, req.params.type),
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

        const existing = await db.query.documentTemplates.findFirst({ where: eq(documentTemplates.type, type) });
        let docTemplate;
        if (existing) {
            [docTemplate] = await db.update(documentTemplates).set({ name, template, settings, updatedAt: new Date() }).where(eq(documentTemplates.id, existing.id)).returning();
        } else {
            [docTemplate] = await db.insert(documentTemplates).values({ type, name, template, settings }).returning();
        }

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

        const notifConditions = [eq(notifications.userId, userId)];
        if (unreadOnly === 'true') notifConditions.push(eq(notifications.isRead, false));
        const notifWhere = and(...notifConditions);

        const [notifRows, [{ value: total }], [{ value: unreadCount }]] = await Promise.all([
            db.query.notifications.findMany({
                where: notifWhere,
                offset: skip,
                limit: Number(limit),
                orderBy: desc(notifications.createdAt),
            }),
            db.select({ value: count() }).from(notifications).where(notifWhere),
            db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
        ]);

        res.json({
            success: true,
            data: notifRows,
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
        await db.update(notifications)
            .set({ isRead: true, readAt: new Date() })
            .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

        res.json({ success: true, data: { message: 'ອ່ານທັງໝົດແລ້ວ' } });
    } catch (error) {
        next(error);
    }
});

// Mark notification as read
settingRoutes.put('/user-notifications/:id/read', authenticate, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const notification = await db.query.notifications.findFirst({
            where: and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)),
        });

        if (!notification) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບການແຈ້ງເຕືອນ' } });
        }

        const [updated] = await db.update(notifications)
            .set({ isRead: true, readAt: new Date() })
            .where(eq(notifications.id, req.params.id))
            .returning();

        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

// Delete a notification
settingRoutes.delete('/user-notifications/:id', authenticate, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        const notification = await db.query.notifications.findFirst({
            where: and(eq(notifications.id, req.params.id), eq(notifications.userId, userId)),
        });

        if (!notification) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'ບໍ່ພົບການແຈ້ງເຕືອນ' } });
        }

        await db.delete(notifications).where(eq(notifications.id, req.params.id));
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
        const apiKeyRows = await db.query.settings.findMany({
            where: and(eq(settings.category, 'api_key'), or(isNull(settings.branchId), eq(settings.branchId, branchId))),
            orderBy: desc(settings.createdAt),
        });

        const keys = apiKeyRows.map(s => {
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

        const existing = await db.query.settings.findFirst({
            where: and(eq(settings.category, 'api_key'), eq(settings.key, name), eq(settings.branchId, branchId)),
        });
        if (existing) {
            return res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'API key name already exists' } });
        }

        const [setting] = await db.insert(settings).values({
            category: 'api_key',
            key: name,
            value: JSON.stringify({ service, apiKey, secretKey, isActive: true }),
            branchId,
        }).returning();

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
        const existing = await db.query.settings.findFirst({ where: eq(settings.id, req.params.id) });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
        }

        const currentVal = typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value as Record<string, unknown>;
        const [updated] = await db.update(settings)
            .set({
                key: name || existing.key,
                value: JSON.stringify({
                    service: service ?? (currentVal as any).service,
                    apiKey: apiKey ?? (currentVal as any).apiKey,
                    secretKey: secretKey ?? (currentVal as any).secretKey,
                    isActive: isActive !== undefined ? isActive : (currentVal as any).isActive,
                    lastUsed: (currentVal as any).lastUsed,
                }),
                updatedAt: new Date(),
            })
            .where(eq(settings.id, req.params.id))
            .returning();

        res.json({ success: true, data: { id: updated.id, name: updated.key } });
    } catch (error) {
        next(error);
    }
});

// Delete API key
settingRoutes.delete('/api-keys/:id', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const existing = await db.query.settings.findFirst({ where: eq(settings.id, req.params.id) });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API key not found' } });
        }
        await db.delete(settings).where(eq(settings.id, req.params.id));
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
        const data = { connected: true, lastSync: new Date().toISOString(), ...req.body };
        await upsertSetting('integration', req.params.id, JSON.stringify(data), branchId);
        res.json({ success: true, data: { id: req.params.id, connected: true } });
    } catch (error) {
        next(error);
    }
});

settingRoutes.post('/integrations/:id/disconnect', authenticate, authorize('settings:update'), async (req, res, next) => {
    try {
        const branchId = req.user!.branchId;
        const existing = await db.query.settings.findFirst({
            where: and(eq(settings.category, 'integration'), eq(settings.key, req.params.id), eq(settings.branchId, branchId)),
        });
        if (existing) {
            const val = typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value as Record<string, unknown>;
            await db.update(settings).set({ value: JSON.stringify({ ...(val as object), connected: false }), updatedAt: new Date() }).where(eq(settings.id, existing.id));
        }
        res.json({ success: true, data: { id: req.params.id, connected: false } });
    } catch (error) {
        next(error);
    }
});
