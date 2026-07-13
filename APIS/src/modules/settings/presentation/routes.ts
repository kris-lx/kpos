// ═══════════════════════════════════════════════════════════════════════════
// Settings Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, ensureScopeAccess, isAdmin } from '@/infrastructure/http/middleware/auth.middleware';
import { DEFAULT_SETTINGS } from '@/shared/constants';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { settings, documents, documentTemplates, notifications, systemEnums, branches, emailProviders, emailTemplates, emailLogs, ssoProviders, transactions } from '@/db/schema/tables';
import { eq, and, or, isNull, inArray, desc, asc, count, sql, gte } from 'drizzle-orm';
import { encryptJson, decryptJson } from '@/shared/crypto';
import { invalidateProviderCache, testProviderConnection, sendTestEmail } from '@/infrastructure/services/email/email.service';
import { invalidateSsoProviderCache, testOidcConnection } from '@/infrastructure/services/sso/sso.service';
import { resolveIntegration, saveIntegration, disconnectIntegration, getIntegrationStatus } from '@/infrastructure/services/integrations/integration.service';
import { verifyChannelToken, broadcastMessage, LineApiError } from '@/infrastructure/services/integrations/line.client';
import { parseServiceAccountJson, verifyAccess as verifyGoogleSheetsAccess, appendRows, GoogleSheetsApiError, type ServiceAccountJson } from '@/infrastructure/services/integrations/google-sheets.client';

export const settingRoutes = Router();

/* eslint-disable no-restricted-syntax -- these 3 helpers take tenantId as an explicit parameter, already used in the WHERE/VALUES clause below */
// Helper: find or create a setting
async function upsertSetting(category: string, key: string, value: any, branchId: string | null | undefined, tenantId?: string | null) {
    const bid = branchId || null; // normalize '' to null — PostgreSQL UUID column rejects empty string
    const tid = tenantId || null;
    const conditions = [eq(settings.category, category), eq(settings.key, key)];
    conditions.push(bid ? eq(settings.branchId, bid) : isNull(settings.branchId));
    if (tid) conditions.push(eq(settings.tenantId, tid));
    const existing = await globalDb.query.settings.findFirst({ where: and(...conditions) });
    if (existing) {
        const [updated] = await globalDb.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.id, existing.id)).returning();
        return updated;
    }
    const [created] = await globalDb.insert(settings).values({ category, key, value, branchId: bid, tenantId: tid }).returning();
    return created;
}

// Helper: get settings with branch fallback (global + branch-specific)
async function getSettingsForBranch(category: string, branchId: string | undefined, tenantId?: string) {
    const branchFilter = branchId
        ? or(isNull(settings.branchId), eq(settings.branchId, branchId))
        : isNull(settings.branchId);
    const conds: any[] = [eq(settings.category, category), branchFilter];
    if (tenantId) conds.push(or(isNull(settings.tenantId), eq(settings.tenantId, tenantId)));
    return globalDb.query.settings.findMany({ where: and(...conds) });
}

// Helper: get settings for multiple categories with branch fallback
async function getSettingsForBranchMultiCategory(categories: string[], branchId: string | undefined, tenantId?: string) {
    const branchFilter = branchId
        ? or(isNull(settings.branchId), eq(settings.branchId, branchId))
        : isNull(settings.branchId);
    const conds: any[] = [inArray(settings.category, categories), branchFilter];
    if (tenantId) conds.push(or(isNull(settings.tenantId), eq(settings.tenantId, tenantId)));
    return globalDb.query.settings.findMany({ where: and(...conds) });
}
/* eslint-enable no-restricted-syntax */

// ═══════════════════════════════════════════════════════════════════════════
// GET ENUMS (dropdown values for UI) - reads from DB only.
// ═══════════════════════════════════════════════════════════════════════════

// Seed defaults used only by explicit DB seed/admin seed commands.
// Runtime enum endpoints must not fall back to this data; if the DB is empty,
// the caller receives empty arrays so missing real configuration is visible.
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
    printer_type: [
        { value: 'receipt', label: 'Receipt Printer', labelLao: 'ເຄື່ອງພິມໃບບິນ', isSystem: true },
        { value: 'kitchen', label: 'Kitchen Printer', labelLao: 'ເຄື່ອງພິມເຮືອນຄົວ', isSystem: true },
        { value: 'label', label: 'Label/Barcode Printer', labelLao: 'ເຄື່ອງພິມລາຄາ/ບາໂຄດ', isSystem: true },
        { value: 'report', label: 'Report Printer', labelLao: 'ເຄື່ອງພິມລາຍງານ', isSystem: true },
    ],
    connection_type: [
        { value: 'usb', label: 'USB', labelLao: 'USB', isSystem: true },
        { value: 'network', label: 'Network (LAN)', labelLao: 'ເຄືອຂ່າຍ (LAN)', isSystem: true },
        { value: 'bluetooth', label: 'Bluetooth', labelLao: 'Bluetooth', isSystem: true },
        { value: 'serial', label: 'Serial Port', labelLao: 'Serial Port', isSystem: true },
    ],
};

settingRoutes.get('/enums', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { type } = req.query;
        const typeList = type ? String(type).split(',').map(t => t.trim()).filter(Boolean) : [];

        // eslint-disable-next-line no-restricted-syntax -- system_enums is a global reference table (no tenantId column)
        const rows = await globalDb.query.systemEnums.findMany({
            where: typeList.length > 0 ? inArray(systemEnums.type, typeList) : undefined,
            orderBy: [asc(systemEnums.type), asc(systemEnums.order), asc(systemEnums.label)],
        });

        const result: Record<string, any[]> = {};
        for (const row of rows.filter(r => r.isActive)) {
            if (!result[row.type]) result[row.type] = [];
            result[row.type].push({ value: row.value, label: row.label, labelLao: row.labelLao });
        }
        if (typeList.length > 0) {
            for (const t of typeList) {
                if (!result[t]) result[t] = [];
            }
        }
        res.json({ success: true, data: result });
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

        // eslint-disable-next-line no-restricted-syntax -- system_enums is a global reference table (no tenantId column)
        const rows = await globalDb.query.systemEnums.findMany({
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
                    if (!result[t]) result[t] = [];
                }
            }
            return res.json({ success: true, data: result });
        }

        const result: Record<string, any[]> = {};
        for (const t of typeList) {
            result[t] = [];
        }
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET ALL SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.get('/', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { category, branchId } = req.query;
        const targetBranchId = branchId ? String(branchId) : req.user!.branchId;

        const branchCond = targetBranchId
            ? or(isNull(settings.branchId), eq(settings.branchId, targetBranchId))
            : isNull(settings.branchId);
        const conditions: any[] = [branchCond];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) conditions.push(or(isNull(settings.tenantId), eq(settings.tenantId, tenantId)));
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
settingRoutes.get('/category/:category', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { category } = req.params;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const settingsRows = await getSettingsForBranch(category, branchId, tenantId);

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
// RECEIPT DESIGN — must be before /:category/:key wildcard
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.get('/receipt/design', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.query.branchId ? String(req.query.branchId) : (req.authUser?.activeBranchId || req.user!.branchId);
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;

        const rows = await getSettingsForBranch('receipt', branchId, tenantId);
        const designRow = rows.find(r => r.key === 'design');

        if (!designRow) {
            return res.json({ success: true, data: null });
        }

        const value = designRow.value as Record<string, unknown>;
        res.json({ success: true, data: value });
    } catch (error) {
        next(error);
    }
});

settingRoutes.put('/receipt/design', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.body.branchId || req.authUser?.activeBranchId || req.user!.branchId;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const { value } = req.body;

        const setting = await upsertSetting('receipt', 'design', value, branchId, tenantId);
        res.json({ success: true, data: setting });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BULK UPDATE SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.post('/bulk', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { settings, isGlobal = false } = req.body;
        const isSuperOrAdmin = isAdmin(req);
        
        // Only super admins and admins can set global settings or modify other branches
        const effectiveGlobal = isGlobal && isSuperOrAdmin;
        const branchId = effectiveGlobal ? null : (isSuperOrAdmin && req.body.branchId ? req.body.branchId : req.user!.branchId);
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;

        const results: any[] = [];

        for (const [category, values] of Object.entries(settings as Record<string, Record<string, unknown>>)) {
            for (const [key, value] of Object.entries(values)) {
                const setting = await upsertSetting(category, key, value as any, branchId, tenantId);
                results.push(setting);
            }
        }

        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET DEFAULT SETTINGS TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.get('/template/default', authenticate, withTenantTx(), authorize('settings:read'), async (_req, res) => {
    const defaultSettings = {
        store: {
            name: 'My Store',
            address: '',
            phone: '',
            taxId: '',
            logo: '',
            currency:        DEFAULT_SETTINGS.currency,
            currencySymbol:  DEFAULT_SETTINGS.currencySymbol,
            currencyIsoCode: DEFAULT_SETTINGS.currencyIsoCode,
            timezone:        DEFAULT_SETTINGS.timezone,
            country:         DEFAULT_SETTINGS.country,
        },
        pos: {
            defaultTaxRate:      DEFAULT_SETTINGS.defaultTaxRate,
            enableTax:           DEFAULT_SETTINGS.enableTax,
            priceIncludesTax:    DEFAULT_SETTINGS.priceIncludesTax,
            allowNegativeStock:  DEFAULT_SETTINGS.allowNegativeStock,
            requireCustomer:     DEFAULT_SETTINGS.requireCustomer,
            defaultPaymentMethod: DEFAULT_SETTINGS.defaultPaymentMethod,
            printReceipt: true,
            showProductImages: true,
        },
        receipt: {
            width:          DEFAULT_SETTINGS.receiptWidth,
            showLogo:       DEFAULT_SETTINGS.showLogo,
            showTaxDetails: DEFAULT_SETTINGS.showTaxDetails,
            footerText:     DEFAULT_SETTINGS.footerText,
            paperSize:      DEFAULT_SETTINGS.receiptWidth,
        },
        display: {
            theme:               DEFAULT_SETTINGS.theme,
            language:            DEFAULT_SETTINGS.language,
            showCustomerDisplay: DEFAULT_SETTINGS.showCustomerDisplay,
            customerDisplayUrl:  '',
        },
        payments: {
            qrMerchantCode:  DEFAULT_SETTINGS.qrMerchantCode,
            qrCurrencyCode:  DEFAULT_SETTINGS.qrCurrencyCode,
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
settingRoutes.post('/initialize', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.body.branchId || req.user!.branchId;

        const defaultSettings: Record<string, Record<string, unknown>> = {
            store: {
                name:            'My Store',
                currency:        DEFAULT_SETTINGS.currency,
                currencySymbol:  DEFAULT_SETTINGS.currencySymbol,
                currencyIsoCode: DEFAULT_SETTINGS.currencyIsoCode,
                timezone:        DEFAULT_SETTINGS.timezone,
                country:         DEFAULT_SETTINGS.country,
            },
            pos: {
                defaultTaxRate:     DEFAULT_SETTINGS.defaultTaxRate,
                enableTax:          DEFAULT_SETTINGS.enableTax,
                priceIncludesTax:   DEFAULT_SETTINGS.priceIncludesTax,
                allowNegativeStock: DEFAULT_SETTINGS.allowNegativeStock,
            },
            receipt: {
                width:    DEFAULT_SETTINGS.receiptWidth,
                showLogo: DEFAULT_SETTINGS.showLogo,
            },
            display: {
                theme:    DEFAULT_SETTINGS.theme,
                language: DEFAULT_SETTINGS.language,
            },
            payments: {
                qrMerchantCode: DEFAULT_SETTINGS.qrMerchantCode,
                qrCurrencyCode: DEFAULT_SETTINGS.qrCurrencyCode,
            },
        };

        const results: any[] = [];

        for (const [category, values] of Object.entries(defaultSettings)) {
            for (const [key, value] of Object.entries(values)) {
                const initBranchCond = branchId ? eq(settings.branchId, branchId) : isNull(settings.branchId);
                const existing = await db.query.settings.findFirst({
                    where: and(eq(settings.category, category), eq(settings.key, key), initBranchCond),
                });

                if (!existing) {
                    const [setting] = await db.insert(settings).values({ category, key, value: value as any, branchId: branchId ?? null }).returning();
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
// STORE LOGO UPLOAD (Cloudinary)
// ═══════════════════════════════════════════════════════════════════════════
settingRoutes.post('/store/logo', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { image } = req.body; // base64 data URI
        if (!image) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'Image data is required' } });
        }

        const { uploadService } = await import('@/infrastructure/services/upload.service');
        const result = await uploadService.uploadSingle(image, {
            folder: 'kpos/logos',
            maxWidth: 512,
            maxHeight: 512,
            quality: 90,
        });

        // Save logo URL to store settings
        const branchId = req.body.branchId || req.authUser?.activeBranchId || req.user?.branchId;
        await upsertSetting('store', 'logo', result.url, branchId || null);

        res.json({ success: true, data: { url: result.url, publicId: result.publicId } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get integrations settings
settingRoutes.get('/integrations', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const settingsRows = await getSettingsForBranchMultiCategory(['integrations', 'integration'], branchId, tenantId);

        // Return as array with id from key
        const integrations = settingsRows.map(s => {
            const val = typeof s.value === 'string' ? JSON.parse(s.value) : s.value;
            return { id: s.key, ...(val as object) };
        });

        // Merge in real connection status for the integrations backed by
        // tenant_integrations (line, google_sheets) — never the decrypted
        // config, just whether a valid credential is on file.
        if (req.authUser?.tenantId) {
            const realTenantId = req.authUser.tenantId;
            for (const type of ['line', 'google_sheets'] as const) {
                const status = await getIntegrationStatus(realTenantId, type);
                const existingIdx = integrations.findIndex(i => i.id === type);
                const merged = { id: type, connected: status.connected, lastSync: status.connectedAt };
                if (existingIdx >= 0) integrations[existingIdx] = { ...integrations[existingIdx], ...merged };
                else integrations.push(merged);
            }
        }

        res.json({ success: true, data: integrations });
    } catch (error) {
        next(error);
    }
});

// Update integration settings
settingRoutes.put('/integrations/:integrationId', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { integrationId } = req.params;
        const { enabled, config } = req.body;
        const branchId = req.body.branchId || req.user!.branchId;
        
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const value = { enabled, config, updatedAt: new Date().toISOString() };
        const setting = await upsertSetting('integrations', integrationId, value, branchId, tenantId);
        
        res.json({ success: true, data: setting });
    } catch (error) {
        next(error);
    }
});

// ── LINE (Messaging API — broadcast) ────────────────────────────────────────
// Not LINE Notify (deprecated by LINE, March 2025). Uses a LINE Official
// Account channel access token; sends via broadcast (all current followers),
// no per-customer LINE user ID linking in this v1.

settingRoutes.post('/integrations/line/connect', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const { channelAccessToken } = req.body;
        if (!channelAccessToken || typeof channelAccessToken !== 'string') {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'channelAccessToken is required' } });
        }

        const info = await verifyChannelToken(channelAccessToken);
        await saveIntegration(tenantId, 'line', { channelAccessToken });

        res.json({ success: true, data: { connected: true, displayName: info.displayName } });
    } catch (error: any) {
        if (error instanceof LineApiError) {
            return res.status(400).json({ success: false, error: { code: 'LINE_TOKEN_INVALID', message: error.message } });
        }
        next(error);
    }
});

settingRoutes.post('/integrations/line/test', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const config = await resolveIntegration<{ channelAccessToken: string }>(tenantId, 'line');
        if (!config) return res.status(404).json({ success: false, error: { code: 'NOT_CONNECTED', message: 'LINE is not connected' } });

        await broadcastMessage(config.channelAccessToken, 'KPOS: ນີ້ແມ່ນຂໍ້ຄວາມທົດສອບ — ການເຊື່ອມຕໍ່ LINE ເຮັດວຽກແລ້ວ!');
        res.json({ success: true, data: { message: 'Test broadcast sent' } });
    } catch (error: any) {
        if (error instanceof LineApiError) {
            return res.status(502).json({ success: false, error: { code: 'LINE_SEND_FAILED', message: error.message } });
        }
        next(error);
    }
});

// ── Google Sheets (service account, no OAuth consent flow) ─────────────────

settingRoutes.post('/integrations/google-sheets/connect', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const { serviceAccountJson, spreadsheetId } = req.body;
        if (!serviceAccountJson || !spreadsheetId) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'serviceAccountJson and spreadsheetId are required' } });
        }

        let sa: ServiceAccountJson;
        try {
            sa = typeof serviceAccountJson === 'string' ? parseServiceAccountJson(serviceAccountJson) : serviceAccountJson;
        } catch (parseErr: any) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_002', message: parseErr.message } });
        }

        const info = await verifyGoogleSheetsAccess(sa, spreadsheetId);
        await saveIntegration(tenantId, 'google_sheets', { serviceAccount: sa, spreadsheetId });

        res.json({ success: true, data: { connected: true, spreadsheetTitle: info.title } });
    } catch (error: any) {
        if (error instanceof GoogleSheetsApiError) {
            return res.status(400).json({ success: false, error: { code: 'GOOGLE_SHEETS_ACCESS_FAILED', message: error.message } });
        }
        next(error);
    }
});

settingRoutes.post('/integrations/google-sheets/export', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const config = await resolveIntegration<{ serviceAccount: ServiceAccountJson; spreadsheetId: string }>(tenantId, 'google_sheets');
        if (!config) return res.status(404).json({ success: false, error: { code: 'NOT_CONNECTED', message: 'Google Sheets is not connected' } });

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todayTxns = await db.query.transactions.findMany({
            where: and(eq(transactions.tenantId, tenantId), gte(transactions.createdAt, startOfDay)),
            columns: { transactionNo: true, total: true, status: true, createdAt: true },
            orderBy: [asc(transactions.createdAt)],
        });

        const rows = todayTxns.map(t => [t.transactionNo, t.total, t.status, t.createdAt.toISOString()]);
        if (rows.length === 0) {
            return res.json({ success: true, data: { exported: 0, message: 'No transactions today — nothing to export' } });
        }

        await appendRows(config.serviceAccount, config.spreadsheetId, 'Sheet1', rows);
        res.json({ success: true, data: { exported: rows.length } });
    } catch (error: any) {
        if (error instanceof GoogleSheetsApiError) {
            return res.status(502).json({ success: false, error: { code: 'GOOGLE_SHEETS_EXPORT_FAILED', message: error.message } });
        }
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// RECEIPT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

// Get receipt settings — merged with branch identity fields
settingRoutes.get('/receipt', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.query.branchId ? String(req.query.branchId) : (req.authUser?.activeBranchId || req.user!.branchId);
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;

        const [settingsRows, branch] = await Promise.all([
            getSettingsForBranch('receipt', branchId, tenantId),
            branchId
                ? db.query.branches.findFirst({
                    where: eq(branches.id, branchId),
                    columns: {
                        id: true, name: true, logo: true, address: true,
                        phone: true, email: true, taxId: true,
                        ownerName: true, registrationNo: true, receiptSettings: true,
                    },
                })
                : null,
        ]);

        const receipt = settingsRows.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {} as Record<string, unknown>);

        // Merge branch identity into receipt settings so the frontend has everything
        const merged = {
            ...receipt,
            branchLogo: branch?.logo ?? null,
            branchName: branch?.name ?? null,
            branchAddress: branch?.address ?? null,
            branchPhone: branch?.phone ?? null,
            branchEmail: branch?.email ?? null,
            branchTaxId: branch?.taxId ?? null,
            ownerName: branch?.ownerName ?? null,
            registrationNo: branch?.registrationNo ?? null,
            ...(branch?.receiptSettings as Record<string, unknown> ?? {}),
        };

        res.json({ success: true, data: merged });
    } catch (error) {
        next(error);
    }
});

// Update receipt settings (key-value pairs + receiptSettings JSONB on branch)
settingRoutes.put('/receipt', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.body.branchId || req.authUser?.activeBranchId || req.user!.branchId;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const {
            headerHtml, footerText, showLogo, showTaxDetails, showQrCode,
            primaryColor, paperSize, showOwnerName, showRegistrationNo,
            // branch identity updates (also written to branches table)
            branchLogo, branchName, ownerName,
            ...rest
        } = req.body;

        const results: any[] = [];

        // Persist receipt display settings to settings table
        const receiptFields: Record<string, unknown> = {
            headerHtml, footerText, showLogo, showTaxDetails, showQrCode,
            primaryColor, paperSize, showOwnerName, showRegistrationNo, ...rest,
        };
        for (const [key, value] of Object.entries(receiptFields)) {
            if (key === 'branchId' || value === undefined) continue;
            const setting = await upsertSetting('receipt', key, value as any, branchId, tenantId);
            results.push(setting);
        }

        // Merge branding fields into branches.receipt_settings JSONB (preserve existing keys)
        if (branchId) {
            const branchUpdates: Record<string, unknown> = {};
            if (headerHtml !== undefined) branchUpdates.headerHtml = headerHtml;
            if (footerText !== undefined) branchUpdates.footerText = footerText;
            if (showLogo !== undefined) branchUpdates.showLogo = showLogo;
            if (primaryColor !== undefined) branchUpdates.primaryColor = primaryColor;
            if (paperSize !== undefined) branchUpdates.paperSize = paperSize;
            if (branchLogo !== undefined) branchUpdates.logo = branchLogo;
            if (branchName !== undefined) branchUpdates.branchName = branchName;
            if (ownerName !== undefined) branchUpdates.ownerName = ownerName;

            if (Object.keys(branchUpdates).length > 0) {
                const conds: any[] = [eq(branches.id, branchId)];
                if (tenantId) conds.push(eq(branches.tenantId, tenantId));
                // Fetch existing receiptSettings first so we don't clobber saved design/other keys
                const existing = await db.query.branches.findFirst({
                    where: and(...conds),
                    columns: { receiptSettings: true },
                });
                const merged = { ...((existing?.receiptSettings as Record<string, unknown>) ?? {}), ...branchUpdates };
                await db.update(branches)
                    .set({ receiptSettings: merged as any, updatedAt: new Date() })
                    .where(and(...conds));
            }
        }

        res.json({ success: true, data: results });
    } catch (error) {
        next(error);
    }
});

// Preview receipt HTML — returns a rendered HTML snippet for the receipt template
settingRoutes.get('/receipt/preview', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.query.branchId ? String(req.query.branchId) : (req.authUser?.activeBranchId || req.user!.branchId);
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;

        const branch = branchId
            ? await db.query.branches.findFirst({
                where: eq(branches.id, branchId),
                columns: { name: true, logo: true, address: true, phone: true, taxId: true, ownerName: true, receiptSettings: true },
            })
            : null;

        const rs = (branch?.receiptSettings as Record<string, any>) ?? {};
        const showLogo = rs.showLogo !== false;
        const headerHtml = rs.headerHtml ?? '';
        const footerText = rs.footerText ?? 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ!';
        const primaryColor = rs.primaryColor ?? '#3b82f6';
        const paperSize = rs.paperSize ?? '80mm';

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body{font-family:'Noto Sans Lao',sans-serif;width:${paperSize};margin:0 auto;padding:8px;font-size:12px;color:#111}
    .header{text-align:center;margin-bottom:8px}
    .logo{max-width:80px;max-height:80px;object-fit:contain}
    .divider{border-top:1px dashed #999;margin:6px 0}
    .row{display:flex;justify-content:space-between}
    .footer{text-align:center;margin-top:8px;font-size:11px;color:#555}
    h2{margin:2px 0;font-size:14px;color:${primaryColor}}
    .sample-item{padding:4px 0}
  </style>
</head>
<body>
  <div class="header">
    ${showLogo && branch?.logo ? `<img src="${branch.logo}" class="logo" alt="Logo"/>` : ''}
    <h2>${branch?.name ?? 'Branch Name'}</h2>
    ${branch?.address ? `<p>${branch.address}</p>` : ''}
    ${branch?.phone ? `<p>Tel: ${branch.phone}</p>` : ''}
    ${branch?.taxId ? `<p>Tax ID: ${branch.taxId}</p>` : ''}
    ${branch?.ownerName ? `<p>Owner: ${branch.ownerName}</p>` : ''}
    ${headerHtml ? `<div>${headerHtml}</div>` : ''}
  </div>
  <div class="divider"></div>
  <div class="row"><span>{{receiptNo}}</span><span>{{createdAt}}</span></div>
  <div class="divider"></div>
  <div class="sample-item"><div class="row"><span>{{items}}</span><span>{{itemTotals}}</span></div></div>
  <div class="divider"></div>
  <div class="row"><b>Total</b><b>{{total}}</b></div>
  <div class="divider"></div>
  <div class="footer">${footerText}</div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TAXES
// ═══════════════════════════════════════════════════════════════════════════

// Get all taxes
settingRoutes.get('/taxes', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;
        
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const settingsRows = await getSettingsForBranch('tax', branchId, tenantId);
        
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
settingRoutes.post('/taxes', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = (req.body.branchId || req.user!.branchId) || null;
        const { name, rate, isActive = true, isDefault = false } = req.body;

        const key = `tax_${Date.now()}`;
        const taxTenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || null;
        const [setting] = await db.insert(settings).values({
            category: 'tax',
            key,
            value: { name, rate, isActive, isDefault } as any,
            branchId,
            tenantId: taxTenantId,
        }).returning();
        
        res.status(201).json({ success: true, data: { id: setting.id, name, rate, isActive, isDefault } });
    } catch (error) {
        next(error);
    }
});

// Update tax
settingRoutes.put('/taxes/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, rate, isActive, isDefault } = req.body;
        
        // BE-76: Tenant-scoped tax update
        const tenantId = req.authUser?.tenantId;
        const taxConds: any[] = [eq(settings.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) taxConds.push(eq(settings.tenantId, tenantId));
        const existing = await db.query.settings.findFirst({ where: and(...taxConds) });
        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tax not found or no access' } });
        }
        
        const currentValue = (existing.value || {}) as Record<string, unknown>;
        const updatedValue = {
            ...currentValue,
            ...(name !== undefined && { name }),
            ...(rate !== undefined && { rate }),
            ...(isActive !== undefined && { isActive }),
            ...(isDefault !== undefined && { isDefault }),
        };
        
        await db.update(settings).set({ value: updatedValue as any, updatedAt: new Date() }).where(and(...taxConds));
        
        res.json({ success: true, data: { id: req.params.id, ...updatedValue } });
    } catch (error) {
        next(error);
    }
});

// Delete tax
settingRoutes.delete('/taxes/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-76: Tenant-scoped tax delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(settings.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) delConds.push(eq(settings.tenantId, tenantId));
        await db.delete(settings).where(and(...delConds));
        res.json({ success: true, data: { message: 'Tax deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PRINTERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all printers
settingRoutes.get('/printers', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;
        
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const settingsRows = await getSettingsForBranch('printer', branchId, tenantId);
        
        const printers = settingsRows
            .filter(s => s.key.startsWith('printer_'))
            .map(s => ({ id: s.id, ...((s.value || {}) as Record<string, unknown>) }));
        
        res.json({ success: true, data: printers });
    } catch (error) {
        next(error);
    }
});

// Create printer
settingRoutes.post('/printers', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.body.branchId || req.user!.branchId;
        const {
            name, type, connectionType,
            ipAddress, port = 9100,
            serialPort, usbDevice,
            isDefault = false, isActive = true,
            paperWidth = 80, characterEncoding = 'UTF-8',
            settings: printerSettings = {},
        } = req.body;

        const key = `printer_${Date.now()}`;
        const value = {
            name, type, connectionType,
            ipAddress, port,
            serialPort, usbDevice,
            isDefault, isActive,
            paperWidth, characterEncoding,
            settings: {
                printSpeed: printerSettings.printSpeed ?? 'normal',
                density: printerSettings.density ?? 'medium',
                cutPaper: printerSettings.cutPaper ?? true,
                openCashDrawer: printerSettings.openCashDrawer ?? false,
                protocol: printerSettings.protocol ?? (type === 'label' ? 'tspl' : 'escpos'),
                labelWidthMm: printerSettings.labelWidthMm ?? (type === 'label' ? paperWidth : undefined),
                labelHeightMm: printerSettings.labelHeightMm ?? (type === 'label' ? 30 : undefined),
                labelGapMm: printerSettings.labelGapMm ?? (type === 'label' ? 2 : undefined),
            },
        };

        const prtTenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || null;
        const prtBranchId = branchId || null;
        const [setting] = await db.insert(settings).values({ category: 'printer', key, value: value as any, branchId: prtBranchId, tenantId: prtTenantId }).returning();

        res.status(201).json({ success: true, data: { id: setting.id, ...value } });
    } catch (error) {
        next(error);
    }
});

// Update printer
settingRoutes.put('/printers/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-76: Tenant-scoped printer update
        const tenantId = req.authUser?.tenantId;
        const pConds: any[] = [eq(settings.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) pConds.push(eq(settings.tenantId, tenantId));
        const existing = await db.query.settings.findFirst({ where: and(...pConds) });
        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Printer not found or no access' } });
        }
        
        const currentValue = (existing.value || {}) as Record<string, unknown>;
        const updatedValue = { ...currentValue, ...req.body };
        delete (updatedValue as any).branchId;
        
        await db.update(settings).set({ value: updatedValue as any, updatedAt: new Date() }).where(and(...pConds));
        
        res.json({ success: true, data: { id: req.params.id, ...updatedValue } });
    } catch (error) {
        next(error);
    }
});

// ESC/POS TCP test print helper
async function sendEscPosTestPage(ip: string, port: number): Promise<void> {
    const { createConnection } = await import('net');
    return new Promise((resolve, reject) => {
        const client = createConnection({ host: ip, port, timeout: 5000 });
        // ESC/POS: init → center → bold → text → bold-off → cut
        const ESC = 0x1B; const GS = 0x1D;
        const data = Buffer.concat([
            Buffer.from([ESC, 0x40]),                          // Initialize
            Buffer.from([ESC, 0x61, 0x01]),                    // Center
            Buffer.from([ESC, 0x45, 0x01]),                    // Bold on
            Buffer.from('** KPOS TEST PRINT **\n'),
            Buffer.from([ESC, 0x45, 0x00]),                    // Bold off
            Buffer.from('--------------------------------\n'),
            Buffer.from([ESC, 0x61, 0x00]),                    // Left
            Buffer.from(`Time: ${new Date().toLocaleString()}\n`),
            Buffer.from('Status: OK\n'),
            Buffer.from('--------------------------------\n'),
            Buffer.from([ESC, 0x61, 0x01]),                    // Center
            Buffer.from('PRINTER CONNECTED\n\n\n'),
            Buffer.from([GS, 0x56, 0x41, 0x03]),               // Cut
        ]);
        client.on('connect', () => { client.write(data, () => { client.end(); resolve(); }); });
        client.on('timeout', () => { client.destroy(); reject(new Error('Connection timeout (5s)')); });
        client.on('error', (err) => { client.destroy(); reject(err); });
    });
}

async function sendTsplTestPage(ip: string, port: number, printer: any): Promise<void> {
    const payload = buildTsplLabelPayload({
        type: 'barcode',
        labelWidthMm: printer?.settings?.labelWidthMm ?? printer?.paperWidth ?? 58,
        labelHeightMm: printer?.settings?.labelHeightMm ?? 30,
        labelGapMm: printer?.settings?.labelGapMm ?? 2,
        showText: true,
        showProductName: true,
        showPrice: false,
        labels: [{ barcode: 'KPOS-TEST', name: 'KPOS TEST PRINT' }],
    });
    await sendEscPosPayload(ip, port, payload);
}

const ESC_POS_BARCODE_TYPE: Record<string, number> = {
    UPC: 65,
    EAN13: 67,
    EAN8: 68,
    CODE39: 69,
    ITF14: 70,
    CODE128: 73,
};

function formatKip(value: unknown): string {
    const amount = Number(value ?? 0);
    return `LAK ${new Intl.NumberFormat('lo-LA', { minimumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)}`;
}

function escposText(text: string): number[] {
    return Array.from(Buffer.from(text, 'utf8'));
}

// Renders as a GS v 0 raster image instead of text bytes — most clone ESC/POS
// firmware only ships Latin/CP437-family codepages, so Lao product names sent
// as UTF-8 text print as blank/garbage. The browser can render Lao correctly
// (via canvas), so the client sends a pre-rendered 1-bit bitmap and we just
// blit it, sidestepping the printer's codepage entirely.
function rasterBitmapCommand(bitmap: { width?: number; height?: number; data?: string } | undefined): number[] | null {
    const width = Number(bitmap?.width) || 0;
    const height = Number(bitmap?.height) || 0;
    if (!bitmap?.data || width <= 0 || height <= 0) return null;
    const widthBytes = Math.ceil(width / 8);
    const buf = Buffer.from(bitmap.data, 'base64');
    const expected = widthBytes * height;
    if (buf.length < expected) return null;
    const GS = 0x1D;
    return [
        GS, 0x76, 0x30, 0x00,
        widthBytes & 0xff, (widthBytes >> 8) & 0xff,
        height & 0xff, (height >> 8) & 0xff,
        ...Array.from(buf.subarray(0, expected)),
    ];
}

function buildEscPosLabelPayload(body: any): Buffer {
    const ESC = 0x1B;
    const GS = 0x1D;
    const chunks: number[][] = [];
    const labels = Array.isArray(body?.labels) ? body.labels : [];
    const barcodeFormat = String(body?.barcodeFormat || 'CODE128');
    const barcodeType = ESC_POS_BARCODE_TYPE[barcodeFormat] ?? ESC_POS_BARCODE_TYPE.CODE128;
    // Floor raised from 40 to 80 dots (~10mm at 203dpi) — shorter than that
    // reads as a squashed, non-standard barcode and hurts scan reliability.
    const barcodeHeight = Math.max(80, Math.min(255, Number(body?.barcodeHeight) || 80));
    const barcodeWidth = Math.max(2, Math.min(6, Number(body?.barcodeWidth) || 2));
    const showText = body?.showText !== false;
    const showProductName = body?.showProductName !== false;
    const showPrice = body?.showPrice !== false;
    const namePosition = body?.namePosition === 'bottom' ? 'bottom' : 'top';

    for (const label of labels) {
        const barcode = String(label?.barcode || label?.sku || label?.id || '').trim();
        chunks.push([ESC, 0x40]);
        chunks.push([ESC, 0x61, 0x01]);

        const nameRaster = showProductName ? rasterBitmapCommand(label?.nameBitmap) : null;
        const printName = () => {
            if (nameRaster) chunks.push(nameRaster);
            else chunks.push([...escposText(String(label?.name || '-')), 0x0a]);
        };
        if (showProductName && namePosition === 'top') printName();

        if (String(body?.type || 'barcode') === 'qrcode') {
            const data = escposText(barcode);
            const storeLen = data.length + 3;
            chunks.push([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
            chunks.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]);
            chunks.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]);
            chunks.push([GS, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30, ...data]);
            chunks.push([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
        } else if (barcode) {
            const data = escposText(barcode);
            chunks.push([GS, 0x68, barcodeHeight]);
            chunks.push([GS, 0x77, barcodeWidth]);
            // Native HRI (GS H / GS f) is unreliable across clone firmware —
            // some units simply never render it even though the barcode bars
            // print fine. Disable it and print the code ourselves below with
            // plain text, which is the one thing confirmed to always work.
            chunks.push([GS, 0x48, 0x00]);
            chunks.push([GS, 0x6b, barcodeType, data.length, ...data]);
        }

        chunks.push([0x0a]);
        if (String(body?.type || 'barcode') !== 'qrcode' && showText && barcode) {
            chunks.push([...escposText(barcode), 0x0a]);
        }
        if (showProductName && namePosition === 'bottom') printName();
        if (showPrice) chunks.push([...escposText(formatKip(label?.price)), 0x0a]);
        // Feed well past the print head before cutting — cutting too soon
        // slices through content that hasn't cleared the head yet, which is
        // why the name/barcode-number lines were silently missing.
        chunks.push([0x0a, 0x0a, 0x0a, 0x0a, 0x0a]);
        if (body?.cutPaper !== false) chunks.push([GS, 0x56, 0x41, 0x40]);
    }

    return Buffer.from(chunks.flat());
}

function tsplText(value: unknown, maxLength = 48): string {
    return String(value ?? '').replace(/"/g, "'").slice(0, maxLength);
}

function buildTsplLabelPayload(body: any): Buffer {
    const labels = Array.isArray(body?.labels) ? body.labels : [];
    const width = Math.max(10, Number(body?.labelWidthMm) || 58);
    const height = Math.max(10, Number(body?.labelHeightMm) || 30);
    const gap = Math.max(0, Number(body?.labelGapMm) || 0);
    // Floor raised from 40 to 80 dots — shorter reads as a squashed,
    // non-standard barcode and hurts scan reliability.
    const barcodeHeight = Math.max(80, Math.min(180, Number(body?.barcodeHeight) || 80));
    const showText = body?.showText !== false;
    const showProductName = body?.showProductName !== false;
    const showPrice = body?.showPrice !== false;
    const namePosition = body?.namePosition === 'bottom' ? 'bottom' : 'top';
    const chunks: string[] = [];

    for (const label of labels) {
        const code = tsplText(label?.barcode || label?.sku || label?.id || '', 80);
        const name = tsplText(label?.name || '-', 36);
        const price = tsplText(formatKip(label?.price), 32);
        chunks.push(`SIZE ${width} mm,${height} mm`);
        chunks.push(`GAP ${gap} mm,0 mm`);
        chunks.push('DIRECTION 1');
        chunks.push('REFERENCE 0,0');
        chunks.push('CLS');

        let codeY = String(body?.type || 'barcode') === 'qrcode' ? 20 : 16;
        if (showProductName && namePosition === 'top') {
            chunks.push(`TEXT 20,20,"0",0,1,1,"${name}"`);
            codeY += 24;
        }

        if (String(body?.type || 'barcode') === 'qrcode') {
            chunks.push(`QRCODE 20,${codeY},L,4,A,0,"${code}"`);
        } else if (code) {
            chunks.push(`BARCODE 20,${codeY},"128",${barcodeHeight},${showText ? 1 : 0},0,2,2,"${code}"`);
        }

        let textY = codeY + (String(body?.type || 'barcode') === 'qrcode' ? 90 : Math.min(160, 12 + barcodeHeight));
        if (showProductName && namePosition === 'bottom') {
            chunks.push(`TEXT 20,${textY},"0",0,1,1,"${name}"`);
            textY += 24;
        }
        if (showPrice) chunks.push(`TEXT 20,${textY},"0",0,1,1,"${price}"`);
        chunks.push('PRINT 1,1');
    }

    return Buffer.from(`${chunks.join('\r\n')}\r\n`, 'utf8');
}

async function sendEscPosPayload(ip: string, port: number, payload: Buffer): Promise<void> {
    const { createConnection } = await import('net');
    return new Promise((resolve, reject) => {
        const client = createConnection({ host: ip, port, timeout: 5000 });
        client.on('connect', () => { client.write(payload, () => { client.end(); resolve(); }); });
        client.on('timeout', () => { client.destroy(); reject(new Error('Connection timeout (5s)')); });
        client.on('error', (err) => { client.destroy(); reject(err); });
    });
}

// Test printer
settingRoutes.post('/printers/:id/test', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const tConds: any[] = [eq(settings.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) tConds.push(eq(settings.tenantId, tenantId));
        const existing = await db.query.settings.findFirst({ where: and(...tConds) });
        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Printer not found or no access' } });
        }

        const printer = existing.value as any;

        // For network printers: attempt real ESC/POS TCP connection
        if (printer?.connectionType === 'network' && printer?.ipAddress) {
            const port = Number(printer.port) || 9100;
            const protocol = printer?.settings?.protocol === 'tspl' ? 'tspl' : 'escpos';
            try {
                if (protocol === 'tspl') await sendTsplTestPage(printer.ipAddress, port, printer);
                else await sendEscPosTestPage(printer.ipAddress, port);
                return res.json({ success: true, data: { message: 'Test print sent via network', method: `${protocol}_tcp` } });
            } catch (tcpErr: any) {
                return res.status(502).json({ success: false, error: { code: 'PRINTER_UNREACHABLE', message: tcpErr.message || 'Cannot reach printer' } });
            }
        }

        // For USB/Bluetooth/Serial/System: instruct frontend to handle locally
        res.json({ success: true, data: { message: 'Test print initiated', method: printer?.connectionType || 'local' } });
    } catch (error) {
        next(error);
    }
});

// Print barcode/QR labels through a configured network ESC/POS printer
settingRoutes.post('/printers/:id/print-labels', authenticate, withTenantTx(), authorize('products:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const pConds: any[] = [eq(settings.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) pConds.push(eq(settings.tenantId, tenantId));
        const existing = await db.query.settings.findFirst({ where: and(...pConds) });
        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Printer not found or no access' } });
        }

        const printer = existing.value as any;
        if (printer?.isActive === false || printer?.type !== 'label') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_PRINTER', message: 'Configured printer is not an active label printer' } });
        }
        if (printer?.connectionType !== 'network' || !printer?.ipAddress) {
            return res.status(400).json({ success: false, error: { code: 'UNSUPPORTED_PRINTER', message: 'Only network label printers can be printed from the server' } });
        }
        if (!Array.isArray(req.body?.labels) || req.body.labels.length === 0) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'No labels provided' } });
        }

        const protocol = printer?.settings?.protocol === 'escpos' ? 'escpos' : 'tspl';
        const payload = protocol === 'tspl' ? buildTsplLabelPayload(req.body) : buildEscPosLabelPayload(req.body);
        await sendEscPosPayload(printer.ipAddress, Number(printer.port) || 9100, payload);
        return res.json({ success: true, data: { message: 'Labels sent to printer', count: req.body.labels.length, protocol } });
    } catch (error: any) {
        if (error?.message) {
            return res.status(502).json({ success: false, error: { code: 'PRINTER_UNREACHABLE', message: error.message } });
        }
        next(error);
    }
});

// Print a POS receipt/slip through a configured network ESC/POS printer.
// The client builds the exact same ESC/POS byte stream used for direct USB
// printing (padding, i18n labels, formatting all live there already) and
// just hands it over base64-encoded — the server's only job is relaying
// those bytes over TCP, since browsers can't open raw sockets themselves.
settingRoutes.post('/printers/:id/print-receipt', authenticate, withTenantTx(), authorize('sales:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const pConds: any[] = [eq(settings.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) pConds.push(eq(settings.tenantId, tenantId));
        const existing = await db.query.settings.findFirst({ where: and(...pConds) });
        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Printer not found or no access' } });
        }

        const printer = existing.value as any;
        if (printer?.isActive === false || printer?.type !== 'receipt') {
            return res.status(400).json({ success: false, error: { code: 'INVALID_PRINTER', message: 'Configured printer is not an active receipt printer' } });
        }
        if (printer?.connectionType !== 'network' || !printer?.ipAddress) {
            return res.status(400).json({ success: false, error: { code: 'UNSUPPORTED_PRINTER', message: 'Only network receipt printers can be printed from the server' } });
        }
        const dataBase64 = String(req.body?.dataBase64 || '');
        if (!dataBase64) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'No receipt data provided' } });
        }

        const payload = Buffer.from(dataBase64, 'base64');
        await sendEscPosPayload(printer.ipAddress, Number(printer.port) || 9100, payload);
        return res.json({ success: true, data: { message: 'Receipt sent to printer' } });
    } catch (error: any) {
        if (error?.message) {
            return res.status(502).json({ success: false, error: { code: 'PRINTER_UNREACHABLE', message: error.message } });
        }
        next(error);
    }
});

// Delete printer
settingRoutes.delete('/printers/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const dConds: any[] = [eq(settings.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) dConds.push(eq(settings.tenantId, tenantId));
        await db.delete(settings).where(and(...dConds));
        res.json({ success: true, data: { message: 'Printer deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get notification settings
settingRoutes.get('/notifications', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;
        
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const settingsRows = await getSettingsForBranch('notifications', branchId, tenantId);
        
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
settingRoutes.put('/notifications', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.body.branchId || req.user!.branchId;
        const notifSettings = req.body;
        
        const results: any[] = [];
        for (const [key, value] of Object.entries(notifSettings)) {
            if (key === 'branchId') continue;
            
            const nTenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
            const setting = await upsertSetting('notifications', key, value as any, branchId, nTenantId);
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
settingRoutes.get('/documents', authenticate, withTenantTx(), authorize('documents:view', 'documents:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { type, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const conditions: any[] = [];
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) conditions.push(eq(documents.tenantId, tenantId));
        if (!req.authUser?.isSuperAdmin && (req.authUser?.roleLevel ?? 7) > 2) {
            const storeIds = req.authUser?.accessibleStoreIds || [];
            const branchIds = req.authUser?.accessibleBranchIds || [];
            const scopeConds: any[] = [];
            if (storeIds.length > 0) scopeConds.push(inArray(documents.storeId, storeIds));
            if (branchIds.length > 0) scopeConds.push(inArray(documents.branchId, branchIds));
            if (scopeConds.length > 0) conditions.push(or(...scopeConds));
        }
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
settingRoutes.get('/documents/:id', authenticate, withTenantTx(), authorize('documents:view', 'documents:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-76: Tenant-scoped document lookup
        const tenantId = req.authUser?.tenantId;
        const dConds: any[] = [eq(documents.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) dConds.push(eq(documents.tenantId, tenantId));
        const document = await db.query.documents.findFirst({
            where: and(...dConds),
        });

        if (!document) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Document not found or no access' } });
            return;
        }
        if (!ensureScopeAccess(document, req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
            return;
        }

        res.json({ success: true, data: document });
    } catch (error) {
        next(error);
    }
});

// Create document
settingRoutes.post('/documents', authenticate, withTenantTx(), authorize('documents:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { type, referenceId, referenceType, data } = req.body;

        // Generate document number
        const prefix = type === 'RECEIPT' ? 'RCP' : type === 'INVOICE' ? 'INV' : type === 'TAX_INVOICE' ? 'TXI' : 'DOC';
        const [{ value: docCount }] = await db.select({ value: count() }).from(documents).where(eq(documents.type, type));
        const documentNo = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(docCount + 1).padStart(5, '0')}`;

        const docTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [document] = await db.insert(documents).values({
            tenantId: docTenantId,
            type,
            documentNo,
            referenceId,
            referenceType,
            branchId: req.authUser?.activeBranchId || req.user?.branchId || null,
            storeId: req.authUser?.activeStoreId || null,
            data,
        }).returning();

        res.status(201).json({ success: true, data: document });
    } catch (error) {
        next(error);
    }
});

// Update document status
settingRoutes.patch('/documents/:id/status', authenticate, withTenantTx(), authorize('documents:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { status } = req.body;

        const setData: any = { status, updatedAt: new Date() };
        if (status === 'PRINTED') setData.printCount = sql`${documents.printCount} + 1`;

        // BE-76: Tenant-scoped document status update
        const tenantId = req.authUser?.tenantId;
        const stConds: any[] = [eq(documents.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) stConds.push(eq(documents.tenantId, tenantId));
        const existing = await db.query.documents.findFirst({ where: and(...stConds) });
        if (!existing || !ensureScopeAccess(existing, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Document not found or no access' } });
        }
        const [document] = await db.update(documents)
            .set(setData)
            .where(and(...stConds))
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
settingRoutes.get('/document-templates', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const templateConds: any[] = [];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            templateConds.push(or(eq(documentTemplates.tenantId, tenantId), isNull(documentTemplates.tenantId)));
        }

        const templates = await db.query.documentTemplates.findMany({
            where: templateConds.length > 0 ? and(...templateConds) : undefined,
            orderBy: asc(documentTemplates.type),
        });

        res.json({ success: true, data: templates });
    } catch (error) {
        next(error);
    }
});

// Get template by type
settingRoutes.get('/document-templates/:type', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const templateConds: any[] = [eq(documentTemplates.type, req.params.type)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            templateConds.push(or(eq(documentTemplates.tenantId, tenantId), isNull(documentTemplates.tenantId)));
        }

        const templates = await db.query.documentTemplates.findMany({
            where: and(...templateConds),
        });
        const template = templates.find(t => t.tenantId === tenantId) || templates.find(t => !t.tenantId);

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
settingRoutes.put('/document-templates/:type', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { type } = req.params;
        const { name, template, settings } = req.body;
        const tenantId = req.authUser?.tenantId;

        if (!tenantId && !req.authUser?.isSuperAdmin) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });
        }

        const templateConds: any[] = [eq(documentTemplates.type, type)];
        if (tenantId) templateConds.push(eq(documentTemplates.tenantId, tenantId));
        else templateConds.push(isNull(documentTemplates.tenantId));

        const existing = await db.query.documentTemplates.findFirst({ where: and(...templateConds) });
        let docTemplate;
        if (existing) {
            [docTemplate] = await db.update(documentTemplates).set({ name, template, settings, updatedAt: new Date() }).where(and(...templateConds)).returning();
        } else {
            [docTemplate] = await db.insert(documentTemplates).values({ tenantId: tenantId || null, type, name, template, settings }).returning();
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
settingRoutes.get('/user-notifications', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
settingRoutes.put('/user-notifications/mark-all-read', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
settingRoutes.put('/user-notifications/:id/read', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
settingRoutes.delete('/user-notifications/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
// EMAIL PROVIDERS (Phase 11)
// ═══════════════════════════════════════════════════════════════════════════

function maskEmailProvider(row: typeof emailProviders.$inferSelect) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        isActive: row.isActive,
        isDefault: row.isDefault,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// List providers (config fields masked — never sent to the client)
settingRoutes.get('/email', authenticate, withTenantTx(), authorize('settings:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const rows = await db.query.emailProviders.findMany({
            where: eq(emailProviders.tenantId, tenantId),
            orderBy: [desc(emailProviders.isDefault), desc(emailProviders.createdAt)],
        });
        res.json({ success: true, data: rows.map(maskEmailProvider) });
    } catch (error) {
        next(error);
    }
});

// Create/save a provider config
settingRoutes.post('/email', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const { name, type, config, isActive = false, isDefault = false } = req.body;
        if (!name || !type || !config) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'name, type and config are required' } });
        }
        if (!['smtp', 'brevo', 'sendgrid', 'mailgun'].includes(type)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_002', message: 'Invalid provider type' } });
        }

        if (isDefault) {
            await db.update(emailProviders).set({ isDefault: false }).where(eq(emailProviders.tenantId, tenantId));
        }

        const [row] = await db.insert(emailProviders).values({
            tenantId,
            name,
            type,
            config: encryptJson(config),
            isActive,
            isDefault,
        }).returning();

        await invalidateProviderCache(tenantId);
        res.status(201).json({ success: true, data: maskEmailProvider(row) });
    } catch (error) {
        next(error);
    }
});

// Update a provider config
settingRoutes.put('/email/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const existing = await db.query.emailProviders.findFirst({
            where: and(eq(emailProviders.id, req.params.id), eq(emailProviders.tenantId, tenantId)),
        });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Provider not found or no access' } });

        const { name, type, config, isActive, isDefault } = req.body;

        if (isDefault === true) {
            await db.update(emailProviders).set({ isDefault: false }).where(eq(emailProviders.tenantId, tenantId));
        }

        const [row] = await db.update(emailProviders).set({
            name: name ?? existing.name,
            type: type ?? existing.type,
            config: config ? encryptJson(config) : existing.config,
            isActive: isActive ?? existing.isActive,
            isDefault: isDefault ?? existing.isDefault,
            updatedAt: new Date(),
        }).where(eq(emailProviders.id, req.params.id)).returning();

        await invalidateProviderCache(tenantId);
        res.json({ success: true, data: maskEmailProvider(row) });
    } catch (error) {
        next(error);
    }
});

// Delete a provider config
settingRoutes.delete('/email/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const existing = await db.query.emailProviders.findFirst({
            where: and(eq(emailProviders.id, req.params.id), eq(emailProviders.tenantId, tenantId)),
        });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Provider not found or no access' } });

        await db.delete(emailProviders).where(eq(emailProviders.id, req.params.id));
        await invalidateProviderCache(tenantId);
        res.json({ success: true, data: { message: 'Deleted' } });
    } catch (error) {
        next(error);
    }
});

// Test connection — verifies adapter.verify() and optionally sends a test email
settingRoutes.post('/email/:id/test', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const existing = await db.query.emailProviders.findFirst({
            where: and(eq(emailProviders.id, req.params.id), eq(emailProviders.tenantId, tenantId)),
        });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Provider not found or no access' } });

        const config = decryptJson(existing.config as unknown as string);
        const verified = await testProviderConnection(existing.type as any, config as any);
        if (!verified) {
            return res.status(502).json({ success: false, error: { code: 'PROVIDER_UNREACHABLE', message: 'Could not verify provider credentials' } });
        }

        const { testEmail } = req.body;
        if (testEmail) {
            await sendTestEmail(existing.type as any, config as any, testEmail);
        }

        res.json({ success: true, data: { message: 'Connection verified', testEmailSent: Boolean(testEmail) } });
    } catch (error: any) {
        res.status(502).json({ success: false, error: { code: 'PROVIDER_TEST_FAILED', message: error?.message || 'Test failed' } });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SSO PROVIDERS (per-tenant OIDC config — mirrors EMAIL PROVIDERS above)
// ═══════════════════════════════════════════════════════════════════════════

function maskSsoProvider(row: typeof ssoProviders.$inferSelect) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        isActive: row.isActive,
        isDefault: row.isDefault,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// List providers (config fields masked — never sent to the client)
settingRoutes.get('/sso', authenticate, withTenantTx(), authorize('settings:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const rows = await db.query.ssoProviders.findMany({
            where: eq(ssoProviders.tenantId, tenantId),
            orderBy: [desc(ssoProviders.isDefault), desc(ssoProviders.createdAt)],
        });
        res.json({ success: true, data: rows.map(maskSsoProvider) });
    } catch (error) {
        next(error);
    }
});

// Create/save a provider config
settingRoutes.post('/sso', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const { name, type = 'oidc', config, isActive = false, isDefault = false } = req.body;
        if (!name || !config) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'name and config are required' } });
        }
        if (type !== 'oidc') {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_002', message: 'Invalid provider type' } });
        }
        if (!config.issuerUrl || !config.clientId || !config.clientSecret) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_003', message: 'issuerUrl, clientId and clientSecret are required' } });
        }

        if (isDefault) {
            await db.update(ssoProviders).set({ isDefault: false }).where(eq(ssoProviders.tenantId, tenantId));
        }

        const [row] = await db.insert(ssoProviders).values({
            tenantId,
            name,
            type,
            config: encryptJson(config),
            isActive,
            isDefault,
        }).returning();

        await invalidateSsoProviderCache(tenantId);
        res.status(201).json({ success: true, data: maskSsoProvider(row) });
    } catch (error) {
        next(error);
    }
});

// Update a provider config
settingRoutes.put('/sso/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const existing = await db.query.ssoProviders.findFirst({
            where: and(eq(ssoProviders.id, req.params.id), eq(ssoProviders.tenantId, tenantId)),
        });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Provider not found or no access' } });

        const { name, config, isActive, isDefault } = req.body;

        if (isDefault === true) {
            await db.update(ssoProviders).set({ isDefault: false }).where(eq(ssoProviders.tenantId, tenantId));
        }

        const [row] = await db.update(ssoProviders).set({
            name: name ?? existing.name,
            config: config ? encryptJson(config) : existing.config,
            isActive: isActive ?? existing.isActive,
            isDefault: isDefault ?? existing.isDefault,
            updatedAt: new Date(),
        }).where(eq(ssoProviders.id, req.params.id)).returning();

        await invalidateSsoProviderCache(tenantId);
        res.json({ success: true, data: maskSsoProvider(row) });
    } catch (error) {
        next(error);
    }
});

// Delete a provider config
settingRoutes.delete('/sso/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const existing = await db.query.ssoProviders.findFirst({
            where: and(eq(ssoProviders.id, req.params.id), eq(ssoProviders.tenantId, tenantId)),
        });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Provider not found or no access' } });

        await db.delete(ssoProviders).where(eq(ssoProviders.id, req.params.id));
        await invalidateSsoProviderCache(tenantId);
        res.json({ success: true, data: { message: 'Deleted' } });
    } catch (error) {
        next(error);
    }
});

// Test connection — verifies the OIDC discovery document is reachable
settingRoutes.post('/sso/:id/test', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const existing = await db.query.ssoProviders.findFirst({
            where: and(eq(ssoProviders.id, req.params.id), eq(ssoProviders.tenantId, tenantId)),
        });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Provider not found or no access' } });

        const config = decryptJson(existing.config as unknown as string);
        await testOidcConnection(config as any);

        res.json({ success: true, data: { message: 'Connection verified' } });
    } catch (error: any) {
        res.status(502).json({ success: false, error: { code: 'PROVIDER_TEST_FAILED', message: error?.message || 'Test failed' } });
    }
});

// List templates
settingRoutes.get('/email/templates', authenticate, withTenantTx(), authorize('settings:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const rows = await db.query.emailTemplates.findMany({
            where: tenantId ? or(eq(emailTemplates.tenantId, tenantId), isNull(emailTemplates.tenantId)) : isNull(emailTemplates.tenantId),
            orderBy: asc(emailTemplates.key),
        });
        // Prefer tenant override over system default when both exist for the same key
        const byKey = new Map<string, typeof rows[number]>();
        for (const row of rows) {
            const existing = byKey.get(row.key);
            if (!existing || (row.tenantId && !existing.tenantId)) byKey.set(row.key, row);
        }
        res.json({ success: true, data: Array.from(byKey.values()) });
    } catch (error) {
        next(error);
    }
});

// Update (or create tenant override of) a template
settingRoutes.put('/email/templates/:key', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const { subject, htmlBody } = req.body;
        if (!subject || !htmlBody) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'subject and htmlBody are required' } });
        }

        const existing = await db.query.emailTemplates.findFirst({
            where: and(eq(emailTemplates.key, req.params.key), eq(emailTemplates.tenantId, tenantId)),
        });

        let row;
        if (existing) {
            [row] = await db.update(emailTemplates).set({ subject, htmlBody, updatedAt: new Date() }).where(eq(emailTemplates.id, existing.id)).returning();
        } else {
            [row] = await db.insert(emailTemplates).values({ tenantId, key: req.params.key, subject, htmlBody }).returning();
        }

        res.json({ success: true, data: row });
    } catch (error) {
        next(error);
    }
});

// Email send log history (last 50)
settingRoutes.get('/email/logs', authenticate, withTenantTx(), authorize('settings:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const rows = await db.query.emailLogs.findMany({
            where: eq(emailLogs.tenantId, tenantId),
            orderBy: desc(emailLogs.sentAt),
            limit: 50,
        });
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// Never return a stored secret in full — the frontend previously received
// the raw apiKey/secretKey on every GET and re-submitted it verbatim on
// save, so any staff account with settings:read access (or anyone who could
// read the response, e.g. via an XSS elsewhere in the app) could pull live
// payment-gateway secrets straight out of devtools/network tab regardless of
// the frontend's purely cosmetic "masked with reveal toggle" display. Only
// the last 4 characters are shown; the rest of the value stays server-side.
function maskSecret(value: string | undefined | null): string {
    if (!value) return '';
    if (value.length <= 4) return '•'.repeat(value.length);
    return '•'.repeat(value.length - 4) + value.slice(-4);
}

// Get all API keys (stored as settings with category 'api_key')
settingRoutes.get('/api-keys', authenticate, withTenantTx(), authorize('settings:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.user!.branchId;
        // BE-76: Tenant isolation
        const tenantId = req.authUser?.tenantId;
        const branchFilter2 = branchId ? or(isNull(settings.branchId), eq(settings.branchId, branchId)) : isNull(settings.branchId);
        const akConds: any[] = [eq(settings.category, 'api_key'), branchFilter2];
        if (tenantId && !req.authUser?.isSuperAdmin) akConds.push(or(isNull(settings.tenantId), eq(settings.tenantId, tenantId)));
        const apiKeyRows = await db.query.settings.findMany({
            where: and(...akConds),
            orderBy: desc(settings.createdAt),
        });

        const keys = apiKeyRows.map(s => {
            const val = decryptJson<Record<string, unknown>>(s.value as unknown as string);
            return {
                id: s.id,
                name: s.key,
                service: (val as any).service || '',
                apiKey: maskSecret((val as any).apiKey),
                secretKey: maskSecret((val as any).secretKey),
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
settingRoutes.post('/api-keys', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, service, apiKey, secretKey } = req.body;
        const branchId = req.user!.branchId || null;

        const akTenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || null;
        const dupBranchCond = branchId ? eq(settings.branchId, branchId) : isNull(settings.branchId);
        const dupConds: any[] = [eq(settings.category, 'api_key'), eq(settings.key, name), dupBranchCond];
        if (akTenantId) dupConds.push(eq(settings.tenantId, akTenantId));
        const existing = await db.query.settings.findFirst({ where: and(...dupConds) });
        if (existing) {
            return res.status(400).json({ success: false, error: { code: 'DUPLICATE', message: 'API key name already exists' } });
        }

        const [setting] = await db.insert(settings).values({
            category: 'api_key',
            key: name,
            value: encryptJson({ service, apiKey, secretKey, isActive: true }),
            branchId,
            tenantId: akTenantId,
        }).returning();

        res.status(201).json({
            success: true,
            data: { id: setting.id, name, service, apiKey: maskSecret(apiKey), secretKey: maskSecret(secretKey), isActive: true, createdAt: setting.createdAt },
        });
    } catch (error) {
        next(error);
    }
});

// Update API key
settingRoutes.put('/api-keys/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, service, apiKey, secretKey, isActive } = req.body;
        // BE-76: Tenant-scoped API key update
        const tenantId = req.authUser?.tenantId;
        const akUpdConds: any[] = [eq(settings.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) akUpdConds.push(eq(settings.tenantId, tenantId));
        const existing = await db.query.settings.findFirst({ where: and(...akUpdConds) });
        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'API key not found or no access' } });
        }

        const currentVal = decryptJson<Record<string, unknown>>(existing.value as unknown as string);
        // apiKey/secretKey are only overwritten when the client actually
        // sends a new value — the frontend now leaves these fields blank on
        // edit (since it never receives the real secret back from GET), so
        // an update that only changes e.g. `name` doesn't clobber the
        // existing credential with an empty string.
        const [updated] = await db.update(settings)
            .set({
                key: name || existing.key,
                value: encryptJson({
                    service: service ?? (currentVal as any).service,
                    apiKey: apiKey || (currentVal as any).apiKey,
                    secretKey: secretKey || (currentVal as any).secretKey,
                    isActive: isActive !== undefined ? isActive : (currentVal as any).isActive,
                    lastUsed: (currentVal as any).lastUsed,
                }),
                updatedAt: new Date(),
            })
            .where(and(...akUpdConds))
            .returning();

        res.json({ success: true, data: { id: updated.id, name: updated.key } });
    } catch (error) {
        next(error);
    }
});

// Delete API key
settingRoutes.delete('/api-keys/:id', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-76: Tenant-scoped API key delete
        const tenantId = req.authUser?.tenantId;
        const akDelConds: any[] = [eq(settings.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) akDelConds.push(eq(settings.tenantId, tenantId));
        const existing = await db.query.settings.findFirst({ where: and(...akDelConds) });
        if (!existing) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'API key not found or no access' } });
        }
        await db.delete(settings).where(and(...akDelConds));
        res.json({ success: true, data: { message: 'Deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATIONS (connect/disconnect)
// ═══════════════════════════════════════════════════════════════════════════

settingRoutes.post('/integrations/:id/connect', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.user!.branchId;
        const intTenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const data = { connected: true, lastSync: new Date().toISOString(), ...req.body };
        await upsertSetting('integration', req.params.id, JSON.stringify(data), branchId, intTenantId);
        res.json({ success: true, data: { id: req.params.id, connected: true } });
    } catch (error) {
        next(error);
    }
});

settingRoutes.post('/integrations/:id/disconnect', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchId = req.user!.branchId;
        const disTenantId = req.authUser?.tenantId;

        // line / google-sheets are backed by tenant_integrations, not the
        // generic settings blob — clear that instead/as well.
        if (disTenantId && (req.params.id === 'line' || req.params.id === 'google-sheets')) {
            await disconnectIntegration(disTenantId, req.params.id === 'google-sheets' ? 'google_sheets' : 'line');
            return res.json({ success: true, data: { id: req.params.id, connected: false } });
        }

        const disBranchCond = branchId ? eq(settings.branchId, branchId) : isNull(settings.branchId);
        const disConds: any[] = [eq(settings.category, 'integration'), eq(settings.key, req.params.id), disBranchCond];
        if (disTenantId && !req.authUser?.isSuperAdmin) disConds.push(eq(settings.tenantId, disTenantId));
        const existing = await db.query.settings.findFirst({ where: and(...disConds) });
        if (existing) {
            const val = typeof existing.value === 'string' ? JSON.parse(existing.value) : existing.value as Record<string, unknown>;
            await db.update(settings).set({ value: JSON.stringify({ ...(val as object), connected: false }), updatedAt: new Date() }).where(eq(settings.id, existing.id));
        }
        res.json({ success: true, data: { id: req.params.id, connected: false } });
    } catch (error) {
        next(error);
    }
});

// ─── LINE Notify test ─────────────────────────────────────────────────────────
settingRoutes.post('/notifications/test-line', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { token } = req.body;
        if (!token) return res.status(400).json({ success: false, error: { message: 'token required' } });
        const storeName = 'KPOS';
        const msg = `[${storeName}] ທົດສອບ LINE Notify ສຳເລັດ! 🎉`;
        const response = await fetch('https://notify-api.line.me/api/notify', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `message=${encodeURIComponent(msg)}`,
        });
        const data = await response.json() as any;
        if (response.ok) {
            return res.json({ success: true, data: { message: 'LINE notification sent' } });
        }
        return res.status(400).json({ success: false, error: { message: data.message || 'LINE API error' } });
    } catch (error) {
        next(error);
    }
});

// ─── Settings Export ───────────────────────────────────────────────────────────
settingRoutes.get('/export', authenticate, withTenantTx(), authorize('settings:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const branchId = req.user!.branchId;
        const conds: any[] = [];
        if (tenantId && !req.authUser?.isSuperAdmin) conds.push(eq(settings.tenantId, tenantId));
        if (branchId) conds.push(or(eq(settings.branchId, branchId), isNull(settings.branchId)));
        const rows = await db.select().from(settings).where(conds.length ? and(...conds) : undefined);
        res.json({ success: true, data: rows, exportedAt: new Date().toISOString() });
    } catch (error) {
        next(error);
    }
});

// ─── Settings Import ───────────────────────────────────────────────────────────
settingRoutes.post('/import', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const branchId = req.user!.branchId;
        const rows: any[] = Array.isArray(req.body?.data) ? req.body.data : [];
        if (rows.length === 0) return res.status(400).json({ success: false, error: { message: 'No data to import' } });
        let imported = 0;
        for (const row of rows) {
            if (!row.category || !row.key) continue;
            await upsertSetting(row.category, row.key, row.value, branchId ?? null, tenantId);
            imported++;
        }
        res.json({ success: true, data: { imported } });
    } catch (error) {
        next(error);
    }
});

// ─── Backup Schedule GET/SET ───────────────────────────────────────────────
settingRoutes.get('/backup/schedule', authenticate, withTenantTx(), authorize('settings:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const row = await db.query.settings.findFirst({
            where: and(eq(settings.category, 'backup'), eq(settings.key, 'schedule')),
        });
        const schedule = row?.value ? String(row.value).replace(/^"|"$/g, '') : '';
        res.json({ success: true, data: { schedule } });
    } catch (error) { next(error); }
});

settingRoutes.put('/backup/schedule', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { schedule } = req.body;
        const branchId = req.user!.branchId;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        await upsertSetting('backup', 'schedule', schedule || '', branchId, tenantId);
        // Reload the scheduler with new schedule
        const { reloadBackupSchedule } = await import('@/infrastructure/workers/backup.worker');
        await reloadBackupSchedule();
        res.json({ success: true, data: { schedule } });
    } catch (error) { next(error); }
});

// ─── Manual Backup Trigger ────────────────────────────────────────────────
settingRoutes.post('/backup/run', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        // Only superadmin may trigger an unscoped (all-tenants) backup — every
        // ordinary tenant admin is forced onto their own tenantId, even if it
        // happened to be absent from the token, so this can never silently
        // dump other tenants' data (see runBackup()'s tenant filter).
        if (!req.authUser?.isSuperAdmin && !req.authUser?.tenantId) {
            res.status(403).json({ success: false, error: { code: 'TENANT_SCOPE_MISSING', message: 'Missing tenant context' } });
            return;
        }
        const backupTenantId = req.authUser?.isSuperAdmin ? undefined : (req.authUser?.tenantId ?? undefined);
        const { runBackup } = await import('@/infrastructure/workers/backup.worker');
        const filepath = await runBackup(backupTenantId);
        res.json({ success: true, data: { filepath, runAt: new Date().toISOString() } });
    } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC CATEGORY/KEY SETTING ROUTES
// Registered last: these two-segment patterns (/:category/:key) would
// otherwise shadow every specific two-segment route above (e.g. /printers/:id,
// /taxes/:id, /document-templates/:type) since Express matches by
// registration order, not specificity.
// ═══════════════════════════════════════════════════════════════════════════

// GET SINGLE SETTING
settingRoutes.get('/:category/:key', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { category, key } = req.params;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;

        // First try branch-specific (only when branchId is defined), then fallback to global
        let setting = branchId ? await db.query.settings.findFirst({
            where: and(eq(settings.category, category), eq(settings.key, key), eq(settings.branchId, branchId)),
        }) : undefined;

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

// UPDATE SETTING
settingRoutes.put('/:category/:key', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { category, key } = req.params;
        const { value, isGlobal = false } = req.body;
        const isSuperOrAdmin = isAdmin(req);

        // Only super admins and admins can set global settings or modify other branches
        const effectiveGlobal = isGlobal && isSuperOrAdmin;
        const branchId = effectiveGlobal ? null : (isSuperOrAdmin && req.body.branchId ? req.body.branchId : req.user!.branchId);

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const setting = await upsertSetting(category, key, value, branchId, tenantId);

        res.json({ success: true, data: setting });
    } catch (error) {
        next(error);
    }
});

// DELETE SETTING
settingRoutes.delete('/:category/:key', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { category, key } = req.params;
        const branchId = req.query.branchId ? String(req.query.branchId) : req.user!.branchId;

        const branchCond2 = branchId ? eq(settings.branchId, branchId) : isNull(settings.branchId);
        const existing = await db.query.settings.findFirst({
            where: and(eq(settings.category, category), eq(settings.key, key), branchCond2),
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
