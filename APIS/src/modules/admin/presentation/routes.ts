// ═══════════════════════════════════════════════════════════════════════════
// Admin Module - Super Admin Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { totalmem, freemem } from 'os';
import { authenticate, authorize, requireSuperAdmin, requireAdmin, requireTenantAdmin, isSuperAdmin, isAdmin, invalidateRoleRulesCache, invalidateAllUserStoreCache, invalidateUserStoreCache, branchFilter, buildTenantCondition, buildScopeCondition, tenantScope, ensureScopeAccess, ROLE_LEVELS, resolveAssignableRole, getRoleLevel } from '@/infrastructure/http/middleware/auth.middleware';
import { permissionsToMask } from '@/infrastructure/permissions';
import { invalidateAllTenantPermissions } from '@/infrastructure/services/permission.service';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { setRequestContext, setSuperAdminBypassContext } from '@/db/set-tenant-context';
import { db as globalDb } from '@/config/database.config';
import { writePlatformAuditLog } from '@/infrastructure/helpers/platform-audit.helper';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';
import argon2 from 'argon2';
import { tenants, users, sessions, roles, rules, roleRules, permissionGroups, permissions, menuPermissions, stores, userStores, productStores, storeRequests, branches, activityLogs, transactions, transactionItems, transactionPayments, heldSales, orders, orderItems, reservations, tables, cashMovements, shifts, cashRegisters, stockTransferItems, stockTransfers, stockMovements, stockCounts, stockCountItems, inventory, purchaseOrderItems, purchaseOrders, vendors, billOfMaterials, productPriceLevels, skuVariants, products, categories, priceLevels, pointsHistory, customers, pointHistory, members, membershipTiers, pointSettings, promotions, coupons, paymentMethods, discounts, settlements, documents, documentTemplates, settings, notifications, systemEnums } from '@/db/schema/tables';
import { eq, and, or, ne, ilike, inArray, notInArray, gte, lte, desc, asc, count, sum, sql, isNull, isNotNull } from 'drizzle-orm';
import { ENUM_SEED_DATA } from '@/modules/settings/presentation/routes';
import {
    DEFAULT_ROLES as ACCESS_DEFAULT_ROLES,
    DEFAULT_RULES as ACCESS_DEFAULT_RULES,
    DEFAULT_ROLE_RULES as ACCESS_DEFAULT_ROLE_RULES,
} from '@/shared/defaultAccessControl';

export const adminRoutes = Router();

// req.tx (a reserved connection) doesn't support .transaction() — see
// tenant-tx.middleware.ts. Handlers that need real atomicity go through the
// pooled globalDb instead, setting the RLS context with SET LOCAL inside.
async function scopedTransaction(req, callback) {
    return globalDb.transaction(async (tx) => {
        const { tenantId, isSuperAdmin, activeBranchPath, activeStorePath } = req.authUser ?? {};
        if (isSuperAdmin) {
            await setSuperAdminBypassContext(tx, { local: true });
        } else if (tenantId) {
            await setRequestContext(tx, { tenantId, branchPath: activeBranchPath, storePath: activeStorePath }, { local: true });
        }
        return callback(tx);
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC STORE REGISTRATION (No Auth Required)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/register-and-apply
 * Public endpoint: create account + submit store application in one step.
 * User is created with isActive=false until approved by super_admin.
 */
adminRoutes.post('/register-and-apply', async (req, res, next) => {
    try {
        const {
            // Account fields
            name, email, password, phone,
            // Business fields
            storeName, storeCode, storeAddress, storePhone, storeEmail, businessType,
            // KYC fields (stored in metadata)
            ownerIdType, ownerIdNumber, ownerName, ownerPhone, ownerNationality,
            businessLicenseNo, taxCertificateNo,
            // Request fields
            reason,
            // Document URLs (uploaded separately or as base64 refs)
            documents,
        } = req.body;

        // Validate all required fields AND password length BEFORE touching Cloudinary
        if (!name || !email || !password || !storeName || !storeCode) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'name, email, password, storeName, storeCode are required' }
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' }
            });
        }

        // Check email uniqueness before uploading files
        // eslint-disable-next-line no-restricted-syntax -- public route (no auth/req.tx), inherently cross-tenant lookup by email
        const existing = await globalDb.query.users.findFirst({ where: eq(users.email, String(email).toLowerCase()) });
        if (existing) {
            return res.status(409).json({
                success: false,
                error: { code: 'EMAIL_EXISTS', message: 'Email already registered' }
            });
        }

        // Upload documents to Cloudinary. Must happen after all validation passes so
        // we never orphan files in the cloud on a rejected request.
        // If Cloudinary is not configured or the upload fails, we store an empty array
        // instead of falling back to bare filenames (which would be unviewable in the UI).
        let documentUrls: string[] = [];
        if (Array.isArray(documents) && documents.length > 0) {
            try {
                const { uploadService } = await import('@/infrastructure/services/upload.service');
                const uploadErrors: string[] = [];
                for (const doc of documents) {
                    const base64Data = typeof doc === 'string' ? doc : doc?.data;
                    if (base64Data) {
                        try {
                            const result = await uploadService.uploadSingle(base64Data, {
                                folder: 'kpos/kyc-documents',
                                resourceType: 'auto',
                            });
                            if (result?.url) documentUrls.push(result.url);
                        } catch (singleErr) {
                            const fname = typeof doc === 'object' ? (doc?.name || 'file') : 'file';
                            uploadErrors.push(fname);
                            console.warn(`[Register] Failed to upload doc "${fname}":`, singleErr instanceof Error ? singleErr.message : singleErr);
                        }
                    }
                }
                if (uploadErrors.length > 0) {
                    console.warn(`[Register] ${uploadErrors.length}/${documents.length} documents failed to upload:`, uploadErrors);
                }
            } catch (uploadErr) {
                console.warn('[Register] Document upload skipped (Cloudinary not configured or error):', uploadErr instanceof Error ? uploadErr.message : uploadErr);
            }
        }

        const hashedPassword = await argon2.hash(String(password));

        // Create user + store request atomically
        const [newUser] = await scopedTransaction(req, async (tx) => {
            const [user] = await tx.insert(users).values({
                email: String(email).toLowerCase(),
                password: hashedPassword,
                name: String(name),
                phone: phone ? String(phone) : undefined,
                role: 'store_owner',
                isActive: false,
                emailVerified: false,
                permissions: [],
            }).returning();

            await tx.insert(storeRequests).values({
                requesterId: user.id,
                type: 'new_store',
                storeName: String(storeName),
                storeCode: String(storeCode).toUpperCase(),
                storeAddress: storeAddress ? String(storeAddress) : undefined,
                storePhone: storePhone ? String(storePhone) : undefined,
                storeEmail: storeEmail ? String(storeEmail) : undefined,
                reason: reason ? String(reason) : undefined,
                // Only store actual Cloudinary URLs — never fall back to bare filenames
                // (which would be unviewable in the admin review UI).
                documents: documentUrls,
                metadata: {
                    businessType: businessType || 'retail',
                    ownerIdType: ownerIdType || 'national_id',
                    ownerIdNumber: ownerIdNumber || '',
                    ownerName: ownerName || name,
                    ownerPhone: ownerPhone || phone || '',
                    ownerNationality: ownerNationality || 'LAO',
                    businessLicenseNo: businessLicenseNo || '',
                    taxCertificateNo: taxCertificateNo || '',
                },
                status: 'pending',
                priority: 'normal',
            });

            return [user];
        });

        res.status(201).json({
            success: true,
            data: {
                userId: newUser.id,
                email: newUser.email,
                message: 'Application submitted. Your account will be activated after approval.',
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE REQUESTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM BRANDING (login-page logo) — public read, super-admin CRUD
// ═══════════════════════════════════════════════════════════════════════════

// Public — the login page renders before any auth, so this must work with
// no token. Safe under RLS with no tenant GUC set: the platform-scope row
// this reads/writes always has tenantId/branchId = NULL, and every
// *_tenant_isolation policy's `tenant_id IS NULL` clause is unconditional
// (see drizzle/0020_superadmin_rls_bypass.sql) — it doesn't depend on
// current_setting() at all, unlike the tenant-scoped branch of that OR.
adminRoutes.get('/public/branding', async (req, res, next) => {
    try {
        // Public platform branding is intentionally tenant-agnostic and is
        // read before authentication, so no request-scoped `db` exists.
        // eslint-disable-next-line no-restricted-syntax -- public platform branding is explicitly filtered to tenantId/branchId NULL
        const row = await globalDb.query.settings.findFirst({
            where: and(eq(settings.category, 'platform'), eq(settings.key, 'loginLogo'), isNull(settings.tenantId), isNull(settings.branchId)),
        });
        res.json({ success: true, data: { loginLogo: (row?.value as string | undefined) ?? null } });
    } catch (error) {
        next(error);
    }
});

adminRoutes.post('/branding/logo', authenticate, requireSuperAdmin(), async (req, res, next) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Image data is required' } });
        }

        const { uploadService, IMAGE_ONLY_MIME_TYPES } = await import('@/infrastructure/services/upload.service');
        const result = await uploadService.uploadSingle(image, {
            folder: 'kpos/platform',
            maxWidth: 512,
            maxHeight: 512,
            quality: 90,
            allowedMimeTypes: IMAGE_ONLY_MIME_TYPES,
        });

        // eslint-disable-next-line no-restricted-syntax -- platform branding is explicitly filtered to tenantId/branchId NULL
        const existing = await globalDb.query.settings.findFirst({
            where: and(eq(settings.category, 'platform'), eq(settings.key, 'loginLogo'), isNull(settings.tenantId), isNull(settings.branchId)),
        });
        if (existing) {
            // eslint-disable-next-line no-restricted-syntax -- platform branding is a global setting
            await globalDb.update(settings).set({ value: result.url, updatedAt: new Date() }).where(eq(settings.id, existing.id));
        } else {
            // eslint-disable-next-line no-restricted-syntax -- platform branding is a global setting
            await globalDb.insert(settings).values({ category: 'platform', key: 'loginLogo', value: result.url, tenantId: null, branchId: null });
        }

        res.json({ success: true, data: { url: result.url } });
    } catch (error) {
        next(error);
    }
});

adminRoutes.delete('/branding/logo', authenticate, requireSuperAdmin(), async (req, res, next) => {
    try {
        // eslint-disable-next-line no-restricted-syntax -- platform branding is explicitly filtered to tenantId/branchId NULL
        const existing = await globalDb.query.settings.findFirst({
            where: and(eq(settings.category, 'platform'), eq(settings.key, 'loginLogo'), isNull(settings.tenantId), isNull(settings.branchId)),
        });
        if (existing) {
            // eslint-disable-next-line no-restricted-syntax -- platform branding is a global setting
            await globalDb.delete(settings).where(eq(settings.id, existing.id));
        }
        res.json({ success: true, data: { deleted: true } });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/requests/count - Get count of pending requests (for notification badge)
 * Must be before /requests/:id to avoid route conflict
 */
adminRoutes.get('/requests/count', authenticate, withTenantTx(), requireTenantAdmin(), authorize('admin:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const countConds: any[] = [eq(storeRequests.status, 'pending')];
        const tenantScope = buildTenantCondition(req.branchFilter, storeRequests.tenantId);
        if (tenantScope) countConds.push(tenantScope);
        const [{ value: pending }] = await db.select({ value: count() }).from(storeRequests).where(and(...countConds));
        res.json({ success: true, data: { pending } });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/requests - Get all store/branch requests (Super Admin only)
 */
adminRoutes.get('/requests', authenticate, withTenantTx(), requireTenantAdmin(), authorize('admin:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { status, type, search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        // Base tenant scope conditions (reused for stats)
        const tenantConds: any[] = [];
        const tenantScope = buildTenantCondition(req.branchFilter, storeRequests.tenantId);
        if (tenantScope) tenantConds.push(tenantScope);

        const reqConds: any[] = [...tenantConds];
        if (status) reqConds.push(eq(storeRequests.status, String(status)));
        if (type) reqConds.push(eq(storeRequests.type, String(type)));
        if (search) {
            const s = `%${String(search)}%`;
            reqConds.push(or(
                ilike(storeRequests.storeName, s),
                ilike(storeRequests.storeCode, s),
                ilike(storeRequests.branchName, s),
                ilike(storeRequests.branchCode, s),
                ilike(storeRequests.storeEmail, s),
                ilike(storeRequests.storePhone, s),
            ));
        }
        const reqWhere = reqConds.length > 0 ? and(...reqConds) : undefined;
        const tenantWhere = tenantConds.length > 0 ? and(...tenantConds) : undefined;

        const [requests, [{ value: total }], statsCounts] = await Promise.all([
            db.query.storeRequests.findMany({
                where: reqWhere,
                offset: skip,
                limit: Number(limit),
                with: {
                    requester: { columns: { id: true, name: true, email: true, phone: true } },
                    reviewer: { columns: { id: true, name: true, email: true } },
                    branch: { columns: { id: true, name: true, code: true } },
                },
                orderBy: [desc(storeRequests.priority), desc(storeRequests.createdAt)],
            }),
            db.select({ value: count() }).from(storeRequests).where(reqWhere),
            Promise.all([
                db.select({ value: count() }).from(storeRequests).where(tenantWhere ? and(tenantWhere, eq(storeRequests.status, 'pending')) : eq(storeRequests.status, 'pending')),
                db.select({ value: count() }).from(storeRequests).where(tenantWhere ? and(tenantWhere, eq(storeRequests.status, 'approved')) : eq(storeRequests.status, 'approved')),
                db.select({ value: count() }).from(storeRequests).where(tenantWhere ? and(tenantWhere, eq(storeRequests.status, 'rejected')) : eq(storeRequests.status, 'rejected')),
            ]),
        ]);

        res.json({
            success: true,
            data: requests,
            stats: {
                pending: statsCounts[0][0].value,
                approved: statsCounts[1][0].value,
                rejected: statsCounts[2][0].value,
            },
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/requests/:id - Get single request details
 */
adminRoutes.get('/requests/:id', authenticate, withTenantTx(), requireTenantAdmin(), authorize('admin:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        const request = await db.query.storeRequests.findFirst({
            where: eq(storeRequests.id, id),
            with: {
                requester: { columns: { id: true, name: true, email: true, phone: true, avatar: true } },
                reviewer: { columns: { id: true, name: true, email: true } },
                branch: { columns: { id: true, name: true, code: true, address: true } },
            },
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Request not found' }
            });
        }

        res.json({ success: true, data: request });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/requests/:id/approve - Approve a store/branch request
 */
adminRoutes.post('/requests/:id/approve', authenticate, withTenantTx(), requireAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { note } = req.body;
        const reviewerId = req.authUser!.userId;

        const request = await db.query.storeRequests.findFirst({ where: eq(storeRequests.id, id) });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Request not found' }
            });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: { code: 'ALREADY_PROCESSED', message: 'Request already processed' }
            });
        }

        // F3: Approval gating.
        // - new_store / new_tenant CREATE a brand-new tenant → platform-level, super admin only.
        // - new_branch must belong to the approver's own tenant.
        if (!req.authUser?.isSuperAdmin) {
            if (request.type === 'new_store' || request.type === 'new_tenant') {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only a super admin can approve new store/tenant registrations' } });
            }
            if (request.tenantId && request.tenantId !== req.authUser?.tenantId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this request' } });
            }
        }

        // Process based on request type
        let createdEntity: any = null;
        let createdTenant: any = null;

        if (request.type === 'new_branch' && request.branchName && request.branchCode) {
            // new_branch: add branch under the EXISTING tenant of the approving admin
            let tenantId: string | null = req.authUser?.tenantId || req.user?.tenantId || null;
            if (tenantId === '') tenantId = null;
            // If the request already has a tenantId (e.g. existing merchant adding a branch), use that
            if (request.tenantId) tenantId = request.tenantId;

            // A branch now belongs to a store (Tenant → Store → Branch) — target
            // the tenant's default/root store since store_requests has no
            // storeId field of its own (only the legacy branchId column).
            let targetStoreId: string | null = null;
            if (tenantId) {
                const defaultStore = await db.query.stores.findFirst({
                    where: and(eq(stores.tenantId, tenantId), eq(stores.isDefault, true)),
                    columns: { id: true },
                }) ?? await db.query.stores.findFirst({
                    where: eq(stores.tenantId, tenantId),
                    columns: { id: true },
                });
                targetStoreId = defaultStore?.id ?? null;
            }
            if (!targetStoreId) {
                return res.status(400).json({ success: false, error: { code: 'NO_STORE', message: 'Tenant has no store to attach this branch to' } });
            }

            // Compute materialized branchPath. A new branch is parented under the
            // store's main (HQ) branch when one exists, else it becomes a root
            // within that store's own branch tree.
            let parentBranchId: string | null = null;
            let branchPath = request.branchCode;
            const mainBranch = await db.query.branches.findFirst({
                where: and(eq(branches.storeId, targetStoreId), eq(branches.isMain, true)),
                columns: { id: true, branchPath: true },
            });
            if (mainBranch?.branchPath) {
                parentBranchId = mainBranch.id;
                branchPath = `${mainBranch.branchPath}.${request.branchCode}`;
            }

            const [br] = await db.insert(branches).values({
                tenantId,
                storeId: targetStoreId,
                parentBranchId,
                branchPath,
                name: request.branchName, code: request.branchCode,
                address: request.branchAddress, phone: request.branchPhone, email: request.branchEmail, isActive: true,
            }).returning();
            createdEntity = br;

        } else if ((request.type === 'new_store' || request.type === 'new_tenant') && request.storeName && request.storeCode) {
            // ═══════════════════════════════════════════════════════════════
            // G13 FIX: Auto-create a NEW Tenant for every new_store approval
            // Each merchant gets their own isolated tenant.
            // ═══════════════════════════════════════════════════════════════
            const meta = (request.metadata || {}) as Record<string, any>;
            const tenantCode = `T-${request.storeCode}-${Date.now().toString(36)}`.toUpperCase();

            const [newTenant] = await db.insert(tenants).values({
                name: request.storeName || 'New Merchant',
                code: tenantCode,
                businessType: meta.businessType || 'retail',
                taxId: meta.taxCertificateNo || null,
                phone: request.storePhone || null,
                email: request.storeEmail || null,
                address: request.storeAddress || null,
                plan: 'free',
                isActive: true,
                status: 'active',
                settings: {
                    ownerName: meta.ownerName || null,
                    ownerPhone: meta.ownerPhone || null,
                    ownerIdType: meta.ownerIdType || null,
                    ownerIdNumber: meta.ownerIdNumber || null,
                    ownerNationality: meta.ownerNationality || null,
                    businessLicenseNo: meta.businessLicenseNo || null,
                },
            }).returning();
            createdTenant = newTenant;
            // Platform audit: new tenant provisioned
            void writePlatformAuditLog({
                actorId: reviewerId as string,
                action: 'TENANT_CREATED',
                tenantId: newTenant.id,
                metadata: { tenantName: newTenant.name, requestId: id, storeName: request.storeName },
            });
            const tenantId = newTenant.id;

            // Create the store — the tenant's root/default store. Its materialized
            // path is just its own code, matching how the old default branch used
            // to root the tenant's branch tree (Tenant → Store → Branch now).
            const [store] = await db.insert(stores).values({
                tenantId,
                name: request.storeName, code: request.storeCode,
                storePath: request.storeCode,
                address: request.storeAddress, phone: request.storePhone, email: request.storeEmail,
                isActive: true, isDefault: true,
            }).returning();
            createdEntity = store;

            // Create the default (HQ) branch under the new store. It is the root
            // of the store's own branch tree, so its materialized path is just
            // its own code.
            let targetBranchId = request.branchId;
            if (!targetBranchId || targetBranchId === '') {
                const hqCode = `BR-${request.storeCode}`;
                const [defaultBranch] = await db.insert(branches).values({
                    tenantId,
                    storeId: store.id,
                    name: `${request.storeName} - ສາຂາຫຼັກ`, code: hqCode,
                    branchPath: hqCode,
                    address: request.storeAddress, phone: request.storePhone, email: request.storeEmail,
                    isActive: true, isMain: true,
                }).returning();
                targetBranchId = defaultBranch.id;
            }

            // Link requester to the new store with full access — a whole-store
            // grant (branchId left NULL), so they see every branch under it,
            // not just this first default one.
            await db.insert(userStores).values([{
                tenantId,
                userId: request.requesterId as string, storeId: store.id as string, branchId: null,
                canRead: true, canWrite: true, canDelete: true, canManage: true, isDefault: true, assignedBy: reviewerId as string,
            }]);

            // Roles/rules are NOT auto-created here on purpose — a super_admin
            // must create (or pick an existing) role for the new tenant and
            // assign it via the Roles + Staff/User management screens after
            // approval. The owner account is activated and linked to the new
            // tenant/store/branch below, but with no roleId/role until that
            // manual step happens — loadCachedAuthUser only ever sources
            // permissions from an actual `roles` row via user.roleId (never a
            // bare name string), so this account is fully locked out of
            // tenant data until a real role is assigned, by design.

            // Activate user + assign to new tenant + store/branch anchors.
            // checkerEnabled explicitly true: the founding owner is the only
            // guaranteed person in a brand-new tenant, so they must be able
            // to void/refund from day one — the column default is false
            // (nobody should default to approver rights), which is right for
            // every OTHER new user but wrong for this one specific case.
            await db.update(users).set({
                isActive: true,
                tenantId,
                storeId: store.id,
                branchId: targetBranchId,
                checkerEnabled: true,
            }).where(eq(users.id, request.requesterId));

            // Update the storeRequest itself with the new tenantId
            await db.update(storeRequests).set({ tenantId }).where(eq(storeRequests.id, id));

            // Invalidate cached auth data so fresh user data is loaded on next login
            await invalidateUserStoreCache(request.requesterId as string).catch(() => {});
        }

        await db.update(storeRequests).set({ status: 'approved', reviewerId: reviewerId || null, reviewNote: note || null, reviewedAt: new Date() }).where(eq(storeRequests.id, id));
        const updatedRequest = await db.query.storeRequests.findFirst({
            where: eq(storeRequests.id, id),
            with: {
                requester: { columns: { id: true, name: true, email: true } },
                reviewer: { columns: { id: true, name: true } },
            },
        });

        res.json({
            success: true,
            data: updatedRequest,
            createdEntity,
            createdTenant,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/requests/:id/reject - Reject a store/branch request
 */
adminRoutes.post('/requests/:id/reject', authenticate, withTenantTx(), requireAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { note } = req.body;
        const reviewerId = req.authUser!.userId;

        const request = await db.query.storeRequests.findFirst({ where: eq(storeRequests.id, id) });

        if (!request) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Request not found' }
            });
        }

        // F3: new_store/new_tenant belong to the platform registration queue (super admin);
        // new_branch rejections are limited to the approver's own tenant.
        if (!req.authUser?.isSuperAdmin) {
            if (request.type === 'new_store' || request.type === 'new_tenant') {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only a super admin can process new store/tenant registrations' } });
            }
            if (request.tenantId && request.tenantId !== req.authUser?.tenantId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this request' } });
            }
        }

        if (request.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: { code: 'ALREADY_PROCESSED', message: 'Request already processed' }
            });
        }

        await db.update(storeRequests).set({ status: 'rejected', reviewerId: reviewerId || null, reviewNote: note || 'ຄຳຂໍຖືກປະຕິເສດ', reviewedAt: new Date() }).where(eq(storeRequests.id, id));
        // Platform audit: request rejected
        void writePlatformAuditLog({
            actorId: reviewerId as string,
            action: 'STORE_REQUEST_REJECTED',
            tenantId: request.tenantId ?? null,
            metadata: { requestId: id, requestType: request.type, note: note || null },
        });
        const updatedRequest = await db.query.storeRequests.findFirst({
            where: eq(storeRequests.id, id),
            with: {
                requester: { columns: { id: true, name: true, email: true } },
                reviewer: { columns: { id: true, name: true } },
            },
        });

        res.json({ success: true, data: updatedRequest });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH MANAGEMENT (Super Admin)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/branches - Get all branches with full details
 */
adminRoutes.get('/branches', authenticate, withTenantTx(), requireTenantAdmin(), authorize('branches:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { search, isActive, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const brConds: any[] = [];
        const tenantScope = buildTenantCondition(req.branchFilter, branches.tenantId);
        if (tenantScope) brConds.push(tenantScope);
        if (isActive !== undefined) brConds.push(eq(branches.isActive, isActive === 'true'));
        if (search) {
            const s = String(search);
            brConds.push(or(ilike(branches.name, `%${s}%`), ilike(branches.code, `%${s}%`)));
        }
        const brWhere = brConds.length > 0 ? and(...brConds) : undefined;

        const [branchList, [{ value: total }]] = await Promise.all([
            db.query.branches.findMany({ where: brWhere, offset: skip, limit: Number(limit), orderBy: [desc(branches.isMain), asc(branches.name)] }),
            db.select({ value: count() }).from(branches).where(brWhere),
        ]);

        // Attach user and product counts per branch. Stores are no longer
        // nested under a branch (a branch belongs to exactly one store now —
        // Tenant → Store → Branch), so there's no per-branch store count
        // anymore; each branch's own storeId (returned on `b` below) says
        // which store it belongs to.
        const branchIds = branchList.map(b => b.id);
        let userCountMap: Record<string, number> = {};
        let productCountMap: Record<string, number> = {};
        if (branchIds.length > 0) {
            const [userCounts, productCounts] = await Promise.all([
                db.select({ branchId: users.branchId, cnt: count() }).from(users).where(and(inArray(users.branchId, branchIds), eq(users.isActive, true))).groupBy(users.branchId),
                db.select({ branchId: products.branchId, cnt: count() }).from(products).where(and(inArray(products.branchId, branchIds), eq(products.isActive, true))).groupBy(products.branchId),
            ]);
            userCounts.forEach(r => { if (r.branchId) userCountMap[r.branchId] = Number(r.cnt); });
            productCounts.forEach(r => { if (r.branchId) productCountMap[r.branchId] = Number(r.cnt); });
        }

        const dataWithCounts = branchList.map(b => ({
            ...b,
            _count: { users: userCountMap[b.id] ?? 0, products: productCountMap[b.id] ?? 0 },
        }));

        res.json({
            success: true,
            data: dataWithCounts,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/branches - Create a new branch (Super Admin only)
 */
adminRoutes.post('/branches', authenticate, withTenantTx(), requireTenantAdmin(), authorize('branches:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, code, address, phone, email, taxId, logo, isMain, settings, parentBranchId, storeId: bodyStoreId } = req.body;

        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Branch name is required' } });
        }
        if (!code || !String(code).trim()) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Branch code is required' } });
        }

        const tenantId = req.authUser?.tenantId || req.user?.tenantId;

        // A branch belongs to exactly one store (Tenant → Store → Branch).
        // Resolve explicit storeId, else the caller's own active store, else
        // the tenant's default store.
        let storeId: string | undefined = bodyStoreId || req.authUser?.activeStoreId || undefined;
        if (!storeId && tenantId) {
            const defaultStore = await db.query.stores.findFirst({
                where: and(eq(stores.tenantId, tenantId), eq(stores.isDefault, true)),
                columns: { id: true },
            }) ?? await db.query.stores.findFirst({ where: eq(stores.tenantId, tenantId), columns: { id: true } });
            storeId = defaultStore?.id;
        }
        if (!storeId) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'storeId is required — no default store found for this tenant' } });
        }
        const targetStore = await db.query.stores.findFirst({ where: eq(stores.id, storeId), columns: { id: true, tenantId: true } });
        if (!targetStore || (tenantId && targetStore.tenantId !== tenantId) || !ensureScopeAccess({ tenantId: targetStore.tenantId }, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Store not found or no access' } });
        }

        const trimmedCode = String(code).trim();

        const dupConds: any[] = [eq(branches.code, trimmedCode)];
        if (tenantId) dupConds.push(eq(branches.tenantId, tenantId));
        const existing = await db.query.branches.findFirst({ where: and(...dupConds) });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Branch code already exists' }
            });
        }

        if (isMain) {
            // isMain now means "the main branch of THIS store" — scope the
            // reset to branches within the same store, not the whole tenant.
            await db.update(branches).set({ isMain: false })
                .where(and(eq(branches.isMain, true), eq(branches.storeId, storeId)));
        }

        // Compute materialized branchPath: parent.path + '.' + code, or code for a root.
        let branchPath = trimmedCode;
        if (parentBranchId) {
            const parent = await db.query.branches.findFirst({
                where: eq(branches.id, parentBranchId),
                columns: { branchPath: true },
            });
            if (parent?.branchPath) branchPath = `${parent.branchPath}.${trimmedCode}`;
        }

        const [branch] = await db.insert(branches).values({
            tenantId,
            storeId,
            parentBranchId: parentBranchId || null,
            branchPath,
            name: String(name).trim(), code: trimmedCode,
            address: address || undefined, phone: phone || undefined, email: email || undefined,
            taxId: taxId || undefined, logo: logo || undefined,
            isMain: isMain || false, settings: settings || {},
        }).returning();

        res.status(201).json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/branches/:id - Update a branch
 */
adminRoutes.put('/branches/:id', authenticate, withTenantTx(), requireTenantAdmin(), authorize('branches:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { name, code, address, phone, email, taxId, logo, isMain, isActive, settings } = req.body;

        const branchTenantScope = tenantScope(req, branches.tenantId);
        const existing = await db.query.branches.findFirst({
            where: branchTenantScope ? and(eq(branches.id, id), branchTenantScope) : eq(branches.id, id),
        });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Branch not found' }
            });
        }

        if (code && code !== existing.code) {
            const dupConds = branchTenantScope ? and(eq(branches.code, code), branchTenantScope) : eq(branches.code, code);
            const duplicate = await db.query.branches.findFirst({ where: dupConds });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Branch code already exists' }
                });
            }
        }

        if (isMain && !existing.isMain) {
            // isMain means "the main branch of THIS store" — scope the reset
            // to branches within the same store, not the whole tenant.
            await db.update(branches).set({ isMain: false }).where(and(eq(branches.isMain, true), eq(branches.storeId, existing.storeId)));
        }

        const [branch] = await db.update(branches).set({ name, code, address, phone, email, taxId, logo, isMain, isActive, settings }).where(eq(branches.id, id)).returning();

        res.json({ success: true, data: branch });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /admin/branches/:id - Deactivate a branch
 */
adminRoutes.delete('/branches/:id', authenticate, withTenantTx(), requireTenantAdmin(), authorize('branches:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        const delBranchScope = tenantScope(req, branches.tenantId);
        const branch = await db.query.branches.findFirst({
            where: delBranchScope ? and(eq(branches.id, id), delBranchScope) : eq(branches.id, id),
        });

        if (!branch) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Branch not found' }
            });
        }

        if (branch.isMain) {
            return res.status(400).json({
                success: false,
                error: { code: 'MAIN_BRANCH', message: 'Cannot delete main branch' }
            });
        }

        await db.update(branches).set({ isActive: false }).where(eq(branches.id, id));

        res.json({ success: true, message: 'Branch deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/stores - Get all stores
 */
adminRoutes.get('/stores', authenticate, withTenantTx(), requireTenantAdmin(), authorize('stores:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { search, parentStoreId, isActive, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const stConds: any[] = [];
        const tenantScope = buildTenantCondition(req.branchFilter, stores.tenantId);
        if (tenantScope) stConds.push(tenantScope);
        if (isActive !== undefined) stConds.push(eq(stores.isActive, isActive === 'true'));
        if (parentStoreId) stConds.push(eq(stores.parentStoreId, String(parentStoreId)));
        if (search) {
            const s = String(search);
            stConds.push(or(ilike(stores.name, `%${s}%`), ilike(stores.code, `%${s}%`)));
        }
        const stWhere = stConds.length > 0 ? and(...stConds) : undefined;

        const [storeList, [{ value: total }]] = await Promise.all([
            db.query.stores.findMany({ where: stWhere, offset: skip, limit: Number(limit), with: { branches: { columns: { id: true, name: true, code: true } } }, orderBy: asc(stores.name) }),
            db.select({ value: count() }).from(stores).where(stWhere),
        ]);

        res.json({
            success: true,
            data: storeList,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/stores - Create a new store (Tenant → Store → Branch — a store
 * no longer needs an existing branch; branches are created under it instead)
 */
adminRoutes.post('/stores', authenticate, withTenantTx(), requireTenantAdmin(), authorize('stores:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, code, parentStoreId, address, phone, email, settings } = req.body;

        const existing = await db.query.stores.findFirst({ where: eq(stores.code, code) });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Store code already exists' }
            });
        }

        const storeTenantId = req.authUser?.tenantId || req.user?.tenantId;

        // Compute materialized storePath: parent.path + '.' + code, or code for a root.
        let storePath = String(code);
        if (parentStoreId) {
            const parent = await db.query.stores.findFirst({ where: eq(stores.id, parentStoreId), columns: { storePath: true } });
            if (parent?.storePath) storePath = `${parent.storePath}.${code}`;
        }

        const [store] = await db.insert(stores).values({
            tenantId: storeTenantId, name, code, parentStoreId: parentStoreId || null, storePath,
            address, phone, email, settings: settings || {}, isActive: true,
        }).returning();

        res.status(201).json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/stores/:id - Update a store
 */
adminRoutes.put('/stores/:id', authenticate, withTenantTx(), requireTenantAdmin(), authorize('stores:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { name, code, address, phone, email, isActive, settings } = req.body;

        const storeTenantScope = tenantScope(req, stores.tenantId);
        const existing = await db.query.stores.findFirst({
            where: storeTenantScope ? and(eq(stores.id, id), storeTenantScope) : eq(stores.id, id),
        });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        if (code && code !== existing.code) {
            const dupConds = storeTenantScope ? and(eq(stores.code, code), storeTenantScope) : eq(stores.code, code);
            const duplicate = await db.query.stores.findFirst({ where: dupConds });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Store code already exists' }
                });
            }
        }

        await db.update(stores).set({ name, code, address, phone, email, isActive, settings }).where(eq(stores.id, id));
        const store = await db.query.stores.findFirst({ where: eq(stores.id, id), with: { branches: { columns: { id: true, name: true } } } });

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /admin/stores/:id - Deactivate a store
 */
adminRoutes.delete('/stores/:id', authenticate, withTenantTx(), requireTenantAdmin(), authorize('stores:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        const delStoreScope = tenantScope(req, stores.tenantId);
        const store = await db.query.stores.findFirst({
            where: delStoreScope ? and(eq(stores.id, id), delStoreScope) : eq(stores.id, id),
        });
        if (!store) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found' }
            });
        }

        await db.update(stores).set({ isActive: false }).where(eq(stores.id, id));

        res.json({ success: true, message: 'Store deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE DETAIL ENDPOINTS (for My Store page)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/stores/:id/details - Get store with full details
 */
adminRoutes.get('/stores/:id/details', authenticate, withTenantTx(), authorize('stores:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const detailsScope = tenantScope(req, stores.tenantId);
        const store = await db.query.stores.findFirst({
            where: detailsScope ? and(eq(stores.id, req.params.id), detailsScope) : eq(stores.id, req.params.id),
            with: { branches: { columns: { id: true, name: true, code: true, address: true, phone: true } } },
        });
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }
        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/stores/:id/stats - Get store statistics
 */
adminRoutes.get('/stores/:id/stats', authenticate, withTenantTx(), authorize('stores:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const statsScope = tenantScope(req, stores.tenantId);
        const store = await db.query.stores.findFirst({ where: statsScope ? and(eq(stores.id, req.params.id), statsScope) : eq(stores.id, req.params.id) });
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }

        // A store can have multiple branches now — aggregate across all of them.
        const storeBranches = await db.query.branches.findMany({ where: eq(branches.storeId, req.params.id), columns: { id: true } });
        const branchIds = storeBranches.map(b => b.id);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [[{ value: totalProducts }], [{ value: totalUsers }], [{ value: todayTransactions }], todaySales] = await Promise.all([
            db.select({ value: count() }).from(productStores).where(and(eq(productStores.storeId, req.params.id), eq(productStores.isActive, true))),
            db.select({ value: count() }).from(userStores).where(eq(userStores.storeId, req.params.id)),
            branchIds.length > 0
                ? db.select({ value: count() }).from(transactions).where(and(inArray(transactions.branchId, branchIds), gte(transactions.createdAt, today), eq(transactions.status, 'COMPLETED')))
                : Promise.resolve([{ value: 0 }]),
            branchIds.length > 0
                ? db.query.transactions.findMany({ where: and(inArray(transactions.branchId, branchIds), gte(transactions.createdAt, today), eq(transactions.status, 'COMPLETED')), columns: { total: true } })
                : Promise.resolve([] as { total: number }[]),
        ]);

        const totalSalesToday = todaySales.reduce((sum: number, t: any) => sum + t.total, 0);

        res.json({
            success: true,
            data: {
                totalProducts,
                totalUsers,
                todayTransactions,
                totalSalesToday,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/stores/:id/branches - Get branches related to store
 */
adminRoutes.get('/stores/:id/branches', authenticate, withTenantTx(), authorize('stores:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchesScope = tenantScope(req, stores.tenantId);
        const store = await db.query.stores.findFirst({ where: branchesScope ? and(eq(stores.id, req.params.id), branchesScope) : eq(stores.id, req.params.id), columns: { id: true } });
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }
        const branchList = await db.query.branches.findMany({ where: eq(branches.storeId, store.id), columns: { id: true, name: true, code: true, address: true, phone: true, isActive: true } });
        res.json({ success: true, data: branchList });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/stores/:id/users - Get users with access to store
 */
adminRoutes.get('/stores/:id/users', authenticate, withTenantTx(), authorize('staff:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const usersStoreScope = tenantScope(req, stores.tenantId);
        const store = await db.query.stores.findFirst({
            where: usersStoreScope ? and(eq(stores.id, req.params.id), usersStoreScope) : eq(stores.id, req.params.id),
            columns: { id: true },
        });
        if (!store) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }
        const usList = await db.query.userStores.findMany({
            where: eq(userStores.storeId, req.params.id),
            with: { user: { columns: { id: true, name: true, email: true, phone: true, role: true, avatar: true, isActive: true } } },
        });
        const userList = usList.map((us: any) => ({
            ...us.user,
            canRead: us.canRead,
            canWrite: us.canWrite,
            canDelete: us.canDelete,
            canManage: us.canManage,
            isDefault: us.isDefault,
        }));
        res.json({ success: true, data: userList });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/stores/:id/update - Update store (non-admin users for their own store)
 */
adminRoutes.put('/stores/:id/update', authenticate, withTenantTx(), authorize('stores:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;

        // Ownership/tenant guard: the target store must belong to the caller's tenant,
        // and non-admins must have manage access to it. Prevents cross-tenant edits.
        const target = await db.query.stores.findFirst({
            where: eq(stores.id, req.params.id),
            columns: { id: true, tenantId: true },
        });
        if (!target) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Store not found' } });
        }
        if (!authUser.isSuperAdmin) {
            if (target.tenantId && target.tenantId !== authUser.tenantId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this store' } });
            }
            // Branch/store-level users must have manage rights on this specific store.
            if (authUser.roleLevel > 2) {
                const access = authUser.accessibleStores.find(s => s.storeId === req.params.id);
                if (!access?.canManage) {
                    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No manage access to this store' } });
                }
            }
        }

        const { name, address, phone, email, description, settings } = req.body;
        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (address !== undefined) updateData.address = address;
        if (phone !== undefined) updateData.phone = phone;
        if (email !== undefined) updateData.email = email;
        if (description !== undefined) updateData.description = description;
        if (settings !== undefined) updateData.settings = settings;

        const [store] = await db.update(stores).set(updateData).where(eq(stores.id, req.params.id)).returning();
        res.json({ success: true, data: store });
    } catch (error: any) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM OVERVIEW (Super Admin Dashboard)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/dashboard - System overview statistics (scoped to tenant)
 */
adminRoutes.get('/dashboard', authenticate, withTenantTx(), requireTenantAdmin(), authorize('admin:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // Build tenant-scoped conditions for each table via centralized scope helper
        const branchTenant = buildTenantCondition(req.branchFilter, branches.tenantId);
        const storeTenant = buildTenantCondition(req.branchFilter, stores.tenantId);
        const userTenant = buildTenantCondition(req.branchFilter, users.tenantId);
        const txTenant = buildTenantCondition(req.branchFilter, transactions.tenantId);
        const reqTenantCond = buildTenantCondition(req.branchFilter, storeRequests.tenantId);
        const branchConds = branchTenant ? [branchTenant] : [];
        const storeConds = storeTenant ? [storeTenant] : [];
        const userConds = userTenant ? [userTenant] : [];
        const txConds = txTenant ? [txTenant] : [];

        const [
            [{ value: totalBranches }],
            [{ value: activeBranches }],
            [{ value: totalStores }],
            [{ value: activeStores }],
            [{ value: totalUsers }],
            [{ value: activeUsers }],
            [{ value: pendingRequests }],
            recentRequests,
            [{ value: todayTransactions }]
        ] = await Promise.all([
            db.select({ value: count() }).from(branches).where(branchConds.length ? and(...branchConds) : undefined),
            db.select({ value: count() }).from(branches).where(and(eq(branches.isActive, true), ...branchConds)),
            db.select({ value: count() }).from(stores).where(storeConds.length ? and(...storeConds) : undefined),
            db.select({ value: count() }).from(stores).where(and(eq(stores.isActive, true), ...storeConds)),
            db.select({ value: count() }).from(users).where(userConds.length ? and(...userConds) : undefined),
            db.select({ value: count() }).from(users).where(and(eq(users.isActive, true), ...userConds)),
            db.select({ value: count() }).from(storeRequests).where(reqTenantCond ? and(eq(storeRequests.status, 'pending'), reqTenantCond) : eq(storeRequests.status, 'pending')),
            db.query.storeRequests.findMany({
                where: reqTenantCond ? and(eq(storeRequests.status, 'pending'), reqTenantCond) : eq(storeRequests.status, 'pending'),
                limit: 5,
                orderBy: desc(storeRequests.createdAt),
                with: { requester: { columns: { name: true, email: true } } },
            }),
            db.select({ value: count() }).from(transactions).where(and(gte(transactions.createdAt, new Date(new Date().setHours(0, 0, 0, 0))), ...txConds)),
        ]);

        res.json({
            success: true,
            data: {
                branches: { total: totalBranches, active: activeBranches },
                stores: { total: totalStores, active: activeStores },
                users: { total: totalUsers, active: activeUsers },
                requests: { pending: pendingRequests, recent: recentRequests },
                transactions: { today: todayTransactions }
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/dashboard/chart-data - Chart data for Pie, Column, Line charts
 */
adminRoutes.get('/dashboard/chart-data', authenticate, withTenantTx(), requireTenantAdmin(), authorize('admin:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantCond = buildTenantCondition(req.branchFilter, users.tenantId);
        const storeTenantCond = buildTenantCondition(req.branchFilter, stores.tenantId);
        const txTenantCond = buildTenantCondition(req.branchFilter, transactions.tenantId);
        const branchTenantCond = buildTenantCondition(req.branchFilter, branches.tenantId);

        // 1. PIE: Users by role
        const usersByRoleRaw = await db.select({
            role: users.role,
            count: count(),
        }).from(users)
        .where(tenantCond ?? undefined)
        .groupBy(users.role)
        .orderBy(desc(count()));

        // 2. COLUMN: Branches per store (stores are the top-level tier now —
        // "stores per branch" doesn't exist anymore, a branch belongs to
        // exactly one store. Response key kept as `storesByBranch` for
        // frontend compatibility; the `branch` label is now a store name.)
        const storesByBranchRaw = await db.select({
            storeId: branches.storeId,
            count: count(),
        }).from(branches)
        .where(branchTenantCond ?? undefined)
        .groupBy(branches.storeId);

        // Get store names
        const branchIds = storesByBranchRaw.map(r => r.storeId).filter(Boolean) as string[];
        const branchNames: Record<string, string> = {};
        if (branchIds.length > 0) {
            const storeRows = await db.select({ id: stores.id, name: stores.name })
                .from(stores)
                .where(and(inArray(stores.id, branchIds), storeTenantCond ?? undefined));
            storeRows.forEach(s => { branchNames[s.id] = s.name; });
        }

        // 3. LINE: Transactions last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const txTrend = await db.select({
            day: sql<string>`DATE(${transactions.createdAt})`,
            count: count(),
            revenue: sql<number>`COALESCE(SUM(${transactions.total}), 0)`,
        }).from(transactions)
        .where(and(gte(transactions.createdAt, sevenDaysAgo), txTenantCond ?? undefined))
        .groupBy(sql`DATE(${transactions.createdAt})`)
        .orderBy(sql`DATE(${transactions.createdAt})`);

        // Fill missing days with 0
        const trendMap: Record<string, { count: number; revenue: number }> = {};
        txTrend.forEach(r => { trendMap[r.day] = { count: Number(r.count), revenue: Number(r.revenue) }; });
        const transactionsTrend: { date: string; count: number; revenue: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            transactionsTrend.push({ date: key, count: trendMap[key]?.count || 0, revenue: trendMap[key]?.revenue || 0 });
        }

        res.json({
            success: true,
            data: {
                usersByRole: usersByRoleRaw.map(r => ({ role: r.role || 'unknown', count: Number(r.count) })),
                storesByBranch: storesByBranchRaw.map(r => ({
                    branch: r.storeId ? (branchNames[r.storeId] || r.storeId.slice(0, 8)) : 'N/A',
                    count: Number(r.count),
                })),
                transactionsTrend,
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/stores-overview
 * Returns branches grouped by tenant with per-branch stats (products, categories, stock, users).
 * Super admin: all tenants. Tenant admin: own tenant only.
 */
adminRoutes.get('/stores-overview', authenticate, withTenantTx(), requireTenantAdmin(), authorize('admin:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const authUser = req.authUser!;
        const filter = req.branchFilter;

        // Fetch branches scoped to tenant
        const branchConds: any[] = [eq(branches.isActive, true)];
        if (!authUser.isSuperAdmin && filter?.tenantId) {
            branchConds.push(eq(branches.tenantId, filter.tenantId));
        }
        // Hard cap — this endpoint returns full stats for every matched
        // branch in one response (no pagination in its shape: branches
        // grouped by tenant). At super_admin scope with this repo's largest
        // scale-test tenant (100k+ branches), fetching them all — even after
        // the join-based rewrite below removed the query-time explosion —
        // still means serializing an unbounded multi-tens-of-MB JSON payload
        // that hangs the request. 2000 comfortably covers any real tenant
        // roster; scale-test data is the only thing that would ever hit it.
        const BRANCH_OVERVIEW_LIMIT = 2000;
        const allBranches = await db.query.branches.findMany({
            where: and(...branchConds),
            columns: { id: true, name: true, code: true, logo: true, tenantId: true, isMain: true, address: true, phone: true },
            orderBy: asc(branches.name),
            limit: BRANCH_OVERVIEW_LIMIT,
        });

        if (allBranches.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const tenantIds = [...new Set(allBranches.map(b => b.tenantId).filter(Boolean))];

        // Fetch tenants for grouping
        const tenantRows = tenantIds.length > 0
            ? await db.query.tenants.findMany({ where: inArray(tenants.id, tenantIds as string[]), columns: { id: true, name: true, logo: true, plan: true, isActive: true } })
            : [];
        const tenantMap = new Map(tenantRows.map(t => [t.id, t]));

        // Per-branch counts, scoped via the same branch condition as a JOIN
        // rather than re-querying by a materialized id list — an inArray()
        // over an unscoped super_admin's full branch set (100k+ ids on this
        // repo's largest scale-test tenant) blew past Postgres's 65,534-
        // bound-parameter limit (MAX_PARAMETERS_EXCEEDED, the exact error
        // this endpoint was 500ing on for super_admin). Joining pushes the
        // same scope down into one indexed query instead of a huge IN-list.
        const [productCounts, categoryCounts, stockCounts2, userCounts] = await Promise.all([
            // products per branch (via inventory)
            db.select({ branchId: inventory.branchId, cnt: count() })
                .from(inventory)
                .innerJoin(branches, eq(inventory.branchId, branches.id))
                .where(and(...branchConds))
                .groupBy(inventory.branchId),
            // categories per branch (via products → categories)
            db.selectDistinct({ branchId: inventory.branchId, categoryId: products.categoryId })
                .from(inventory)
                .innerJoin(products, eq(inventory.productId, products.id))
                .innerJoin(branches, eq(inventory.branchId, branches.id))
                .where(and(...branchConds, isNotNull(products.categoryId))),
            // stock value per branch
            db.select({ branchId: inventory.branchId, qty: sum(inventory.quantity), val: sql<number>`sum(${inventory.quantity} * COALESCE(${products.cost}, ${products.price}, 0))` })
                .from(inventory)
                .innerJoin(products, eq(inventory.productId, products.id))
                .innerJoin(branches, eq(inventory.branchId, branches.id))
                .where(and(...branchConds))
                .groupBy(inventory.branchId),
            // users per branch
            db.select({ branchId: users.branchId, cnt: count() })
                .from(users)
                .innerJoin(branches, eq(users.branchId, branches.id))
                .where(and(...branchConds, eq(users.isActive, true)))
                .groupBy(users.branchId),
        ]);

        const productCountMap = new Map(productCounts.map(r => [r.branchId, r.cnt]));
        const categoryCountMap = new Map<string, Set<string>>();
        for (const r of categoryCounts) {
            if (!categoryCountMap.has(r.branchId)) categoryCountMap.set(r.branchId, new Set());
            if (r.categoryId) categoryCountMap.get(r.branchId)!.add(r.categoryId);
        }
        const stockMap = new Map(stockCounts2.map(r => [r.branchId, { qty: Number(r.qty || 0), val: Number(r.val || 0) }]));
        const userCountMap = new Map(userCounts.map(r => [r.branchId, r.cnt]));

        // Enrich branches. storeCount is always 1 now — a branch belongs to
        // exactly one store under the reversed hierarchy (previously a branch
        // could contain many stores, so this was a real aggregate).
        const enrichedBranches = allBranches.map(b => ({
            ...b,
            stats: {
                productCount: productCountMap.get(b.id) || 0,
                categoryCount: categoryCountMap.get(b.id)?.size || 0,
                stockQty: stockMap.get(b.id)?.qty || 0,
                stockValue: stockMap.get(b.id)?.val || 0,
                userCount: userCountMap.get(b.id) || 0,
                storeCount: 1,
            },
        }));

        // Group by tenant
        const grouped: any[] = [];
        for (const [tenantId, tenant] of tenantMap) {
            grouped.push({
                tenant,
                branches: enrichedBranches.filter(b => b.tenantId === tenantId),
            });
        }
        // Branches without tenant
        const orphaned = enrichedBranches.filter(b => !b.tenantId);
        if (orphaned.length > 0) grouped.push({ tenant: null, branches: orphaned });

        res.json({ success: true, data: grouped });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/users - Create a new user (Super Admin / Admin)
 */
adminRoutes.post('/users', authenticate, withTenantTx(), requireSuperAdmin(), authorize('staff:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { email, password, name, phone, avatar, role, roleId, branchId, permissions, isActive = true } = req.body;

        // Validate required fields
        if (!email || !password || !name) {
            return res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Email, password, and name are required' }
            });
        }

        // Check if email exists
        const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Email already exists' }
            });
        }

        // A platform-level super admin has no tenantId of their own — for
        // them, the target tenant must come from the request body, or every
        // user created via this admin endpoint silently ends up orphaned
        // (tenantId: null, unable to actually act as that tenant's staff).
        const tenantId = req.authUser?.isSuperAdmin
            ? (req.body.tenantId ?? null)
            : (req.authUser?.tenantId || req.user?.tenantId);

        // Resolve via the same shared path staff/presentation/routes.ts uses —
        // handles both roleId and name-only lookups, tenant/branch visibility,
        // and the privilege ladder (cannot assign a role above your own
        // level). The previous ad hoc `roleId`-only lookup here left a
        // role-name-only request (the common case — e.g. { role: "cashier" })
        // completely unresolved: the user was created with roleId: null,
        // which meant GET /users/me/menu had no role_rules to look up and
        // returned an empty menu for that account.
        let roleName = role || 'staff';
        let resolvedRoleId: string | undefined;
        if (roleId || role) {
            const resolved = await resolveAssignableRole(db, {
                roleId,
                roleName: role,
                callerTenantId: tenantId ?? null,
                callerBranchId: req.authUser?.activeBranchId ?? null,
                callerRoleLevel: req.authUser?.roleLevel ?? 7,
                callerIsSuperAdmin: req.authUser?.isSuperAdmin ?? false,
                callerPermissions: req.authUser?.permissions || [],
            });
            if (resolved) {
                roleName = resolved.name;
                resolvedRoleId = resolved.id;
            } else if (roleId) {
                // Explicit roleId requested but not assignable — reject
                // outright rather than silently falling back to a plain
                // "staff" role the caller didn't ask for.
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Role not found or not assignable' } });
            }
        }

        // Cannot grant a permission the caller doesn't personally hold —
        // otherwise any tenant-admin-level caller could hand a brand-new
        // account permissions: ["*"] regardless of the resolved role, since
        // this array is merged into the user's effective permission set at
        // auth-load time. Same guard as staff/presentation/routes.ts.
        const rawPermissions = Array.isArray(permissions) ? permissions.filter((p: unknown) => typeof p === 'string') : [];
        const scopedPermissions = req.authUser?.isSuperAdmin || (req.authUser?.permissions || []).includes('*')
            ? rawPermissions
            : rawPermissions.filter((p: string) => (req.authUser?.permissions || []).includes(p));

        // Hash password
        const hashedPassword = await argon2.hash(password);

        const [user] = await db.insert(users).values({
            tenantId,
            email,
            password: hashedPassword,
            name,
            phone,
            avatar,
            role: roleName,
            roleId: resolvedRoleId,
            branchId,
            permissions: scopedPermissions,
            isActive,
        }).returning({
            id: users.id,
            tenantId: users.tenantId,
            email: users.email,
            name: users.name,
            phone: users.phone,
            avatar: users.avatar,
            role: users.role,
            roleId: users.roleId,
            branchId: users.branchId,
            permissions: users.permissions,
            isActive: users.isActive,
            isSuperAdmin: users.isSuperAdmin,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
        });

        // Log activity
        await logActivity(req.authUser!.userId, 'user_created', `ສ້າງຜູ້ໃຊ້ໃໝ່: ${name}`, { targetUserId: user.id }, req);

        res.status(201).json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/users - List all users (Super Admin)
 */
adminRoutes.get('/users', authenticate, withTenantTx(), requireSuperAdmin(), authorize('staff:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { search, branchId, isActive, isSuperAdmin, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const uConds: any[] = [];
        const tenantScope = buildTenantCondition(req.branchFilter, users.tenantId);
        if (tenantScope) uConds.push(tenantScope);
        if (isActive !== undefined) uConds.push(eq(users.isActive, isActive === 'true'));
        if (isSuperAdmin !== undefined) uConds.push(eq(users.isSuperAdmin, isSuperAdmin === 'true'));
        if (branchId) uConds.push(eq(users.branchId, String(branchId)));
        if (search) {
            const s = String(search);
            uConds.push(or(ilike(users.name, `%${s}%`), ilike(users.email, `%${s}%`)));
        }
        const uWhere = uConds.length > 0 ? and(...uConds) : undefined;

        const [userList, [{ value: total }]] = await Promise.all([
            db.query.users.findMany({
                where: uWhere,
                offset: skip,
                limit: Number(limit),
                columns: { id: true, email: true, name: true, phone: true, role: true, roleId: true, permissions: true, isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true },
                with: {
                    branch: { columns: { id: true, name: true, code: true } },
                    roleRelation: { columns: { id: true, name: true, displayName: true } },
                },
                orderBy: [desc(users.isSuperAdmin), asc(users.name)],
            }),
            db.select({ value: count() }).from(users).where(uWhere),
        ]);

        res.json({
            success: true,
            data: userList,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/users/:id/super-admin - Toggle Super Admin status
 */
adminRoutes.put('/users/:id/super-admin', authenticate, withTenantTx(), requireSuperAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { isSuperAdmin: newStatus } = req.body;

        if (id === req.authUser!.userId && newStatus === false) {
            return res.status(400).json({
                success: false,
                error: { code: 'SELF_DEMOTION', message: 'Cannot remove your own Super Admin status' }
            });
        }

        const [user] = await db.update(users).set({ isSuperAdmin: Boolean(newStatus) }).where(eq(users.id, id)).returning({ id: users.id, name: users.name, email: users.email, isSuperAdmin: users.isSuperAdmin });

        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STORE REQUEST CREATION (For regular users to request new store/branch)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/requests - Create a new store/branch request (Any authenticated user)
 */
adminRoutes.post('/requests', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const requesterId = req.authUser!.userId;
        const {
            type,
            branchId,
            storeName, storeCode, storeAddress, storePhone, storeEmail,
            branchName, branchCode, branchAddress, branchPhone, branchEmail,
            reason,
            documents,
            metadata,
            priority
        } = req.body;

        // Validate type
        if (!['new_store', 'new_branch', 'branch_update', 'new_tenant'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: { code: 'INVALID_TYPE', message: 'Invalid request type' }
            });
        }



        const dupConds: any[] = [eq(storeRequests.requesterId, requesterId), eq(storeRequests.status, 'pending'), eq(storeRequests.type, type)];
        const orConds: any[] = [];
        if (storeCode) orConds.push(eq(storeRequests.storeCode, storeCode));
        if (branchCode) orConds.push(eq(storeRequests.branchCode, branchCode));
        if (orConds.length > 0) dupConds.push(or(...orConds));
        const existingRequest = await db.query.storeRequests.findFirst({ where: and(...dupConds) });

        if (existingRequest) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE_REQUEST', message: 'Similar request already pending' }
            });
        }

        const reqTenantId = req.authUser?.tenantId || req.user?.tenantId;

        // Upload documents (base64) to cloud storage if provided
        let documentUrls: string[] = [];
        if (Array.isArray(documents) && documents.length > 0) {
            try {
                const { uploadService } = await import('@/infrastructure/services/upload.service');
                for (const doc of documents) {
                    const base64Data = typeof doc === 'string' ? doc : doc?.data;
                    if (base64Data) {
                        const result = await uploadService.uploadSingle(base64Data, {
                            folder: 'kpos/store-requests',
                            resourceType: 'auto',
                        });
                        if (result?.url) documentUrls.push(result.url);
                    }
                }
            } catch (uploadErr) {
                console.warn('[AdminRequest] Document upload failed:', uploadErr instanceof Error ? uploadErr.message : uploadErr);
            }
        }

        const [created] = await db.insert(storeRequests).values({
            tenantId: reqTenantId === '' ? null : reqTenantId,
            requesterId, type, branchId: branchId === '' ? null : branchId, storeName, storeCode, storeAddress, storePhone, storeEmail,
            branchName, branchCode, branchAddress, branchPhone, branchEmail, reason,
            documents: documentUrls.length > 0 ? documentUrls : (Array.isArray(documents) ? documents.map((d: any) => typeof d === 'string' ? d : d?.name || 'document').filter(Boolean) : []),
            metadata: metadata || {}, priority: priority || 'normal', status: 'pending',
        }).returning();
        const request = await db.query.storeRequests.findFirst({ where: eq(storeRequests.id, created.id), with: { requester: { columns: { name: true, email: true } } } });

        res.status(201).json({ success: true, data: request });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/my-requests - Get current user's requests
 */
adminRoutes.get('/my-requests', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const requesterId = req.authUser!.userId;
        const { status, page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const myConds: any[] = [eq(storeRequests.requesterId, requesterId)];
        if (status) myConds.push(eq(storeRequests.status, String(status)));
        const myWhere = and(...myConds);

        const [requests, [{ value: total }]] = await Promise.all([
            db.query.storeRequests.findMany({
                where: myWhere, offset: skip, limit: Number(limit),
                with: { reviewer: { columns: { name: true } }, branch: { columns: { name: true, code: true } } },
                orderBy: desc(storeRequests.createdAt),
            }),
            db.select({ value: count() }).from(storeRequests).where(myWhere),
        ]);

        res.json({
            success: true,
            data: requests,
            meta: { page: Number(page), limit: Number(limit), total }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/check-super-admin - Check if current user is Super Admin
 */
adminRoutes.get('/check-super-admin', authenticate, withTenantTx(), async (req, res) => {
    res.json({
        success: true,
        data: {
            isSuperAdmin: isSuperAdmin(req),
            userId: req.authUser?.userId
        }
    });
});

/**
 * GET /admin/permissions - Get all permission groups (dynamic from database or default)
 */
adminRoutes.get('/permissions', authenticate, withTenantTx(), requireSuperAdmin(), authorize('admin:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const dbPermissions = await db.query.permissionGroups.findMany({
            where: eq(permissionGroups.isActive, true),
            orderBy: asc(permissionGroups.order),
            with: { permissions: { where: eq(permissions.isActive, true), orderBy: asc(permissions.order) } },
        });

        if (dbPermissions.length > 0) {
            const formattedPermissions = dbPermissions.map(group => ({
                key: group.key,
                label: group.label,
                icon: group.icon || 'Shield',
                color: group.color || 'from-gray-500 to-slate-500',
                permissions: group.permissions
            }));

            return res.json({ success: true, data: formattedPermissions });
        }

        // Return default permission groups if none in database
        res.json({ success: true, data: DEFAULT_PERMISSION_GROUPS });
    } catch (error) {
        res.json({ success: true, data: DEFAULT_PERMISSION_GROUPS });
    }
});

/**
 * POST /admin/permissions - Create/Update permission groups (Super Admin only)
 */
adminRoutes.post('/permissions', authenticate, withTenantTx(), requireSuperAdmin(), authorize('admin:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { groups } = req.body;

        if (!Array.isArray(groups)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'groups must be an array' } });
        }

        const seenGroupKeys = new Set<string>();
        const seenPermissionKeys = new Set<string>();
        for (const group of groups) {
            if (!group || typeof group.key !== 'string' || !group.key.trim() || !Array.isArray(group.permissions)) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Each group needs a key and permissions array' } });
            }
            if (seenGroupKeys.has(group.key)) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Duplicate permission group: ${group.key}` } });
            }
            seenGroupKeys.add(group.key);
            for (const permission of group.permissions) {
                if (!permission || typeof permission.key !== 'string' || !permission.key.trim()) {
                    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Each permission needs a key' } });
                }
                if (seenPermissionKeys.has(permission.key)) {
                    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Duplicate permission: ${permission.key}` } });
                }
                seenPermissionKeys.add(permission.key);
            }
        }

        // Keep catalog rows stable because roles and audit data may reference
        // their IDs. Deactivate rows omitted from the submitted catalog, then
        // update or insert the rows that remain.
        await db.update(permissions).set({ isActive: false, updatedAt: new Date() });
        await db.update(permissionGroups).set({ isActive: false, updatedAt: new Date() });

        const existingGroups = await db.query.permissionGroups.findMany();
        const existingPermissions = await db.query.permissions.findMany();
        const groupsByKey = new Map(existingGroups.map(group => [group.key, group]));
        const permissionsByKey = new Map(existingPermissions.map(permission => [permission.key, permission]));

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const existingGroup = groupsByKey.get(group.key);
            let pg = existingGroup;
            if (existingGroup) {
                const [updatedGroup] = await db.update(permissionGroups)
                    .set({ label: group.label, icon: group.icon, color: group.color, order: i, isActive: true, updatedAt: new Date() })
                    .where(eq(permissionGroups.id, existingGroup.id))
                    .returning();
                pg = updatedGroup;
            } else {
                const [createdGroup] = await db.insert(permissionGroups)
                    .values({ key: group.key, label: group.label, icon: group.icon, color: group.color, order: i, isActive: true })
                    .returning();
                pg = createdGroup;
            }
            for (let j = 0; j < group.permissions.length; j++) {
                const p = group.permissions[j];
                const existingPermission = permissionsByKey.get(p.key);
                if (existingPermission) {
                    await db.update(permissions)
                        .set({ label: p.label, groupId: pg.id, order: j, isActive: true, updatedAt: new Date() })
                        .where(eq(permissions.id, existingPermission.id));
                } else {
                    await db.insert(permissions)
                        .values({ key: p.key, label: p.label, groupId: pg.id, order: j, isActive: true });
                }
            }
        }

        await logActivity(
            req.authUser!.userId,
            'permission_catalog_updated',
            `Updated ${groups.length} permission groups and ${seenPermissionKeys.size} permissions`,
            { groupCount: groups.length, permissionCount: seenPermissionKeys.size },
            req,
        );

        // A global catalog change can affect every tenant role's effective
        // permission mask and the menu cached for already-signed-in users.
        const tenantRows = await db.query.tenants.findMany({ columns: { id: true } });
        await Promise.all(tenantRows.map(tenant => invalidateAllTenantPermissions(tenant.id).catch(() => {})));
        await invalidateAllUserStoreCache();

        res.json({ success: true, message: 'Permissions updated successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ROLES MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/roles - Get all roles
 */
adminRoutes.get('/roles', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { search, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const rConds: any[] = [];
        // Non-super-admins only see their tenant's roles; super-admin sees all
        if (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) {
            rConds.push(eq(roles.tenantId, req.authUser.tenantId));
        }
        if (search) {
            const s = String(search);
            rConds.push(or(ilike(roles.name, `%${s}%`), ilike(roles.displayName, `%${s}%`)));
        }
        const rWhere = rConds.length > 0 ? and(...rConds) : undefined;

        const [roleList, [{ value: total }]] = await Promise.all([
            db.query.roles.findMany({ where: rWhere, offset: skip, limit: Number(limit), orderBy: [desc(roles.isSystem), asc(roles.name)] }),
            db.select({ value: count() }).from(roles).where(rWhere),
        ]);

        res.json({
            success: true,
            data: roleList,
            meta: { page: Number(page), limit: Number(limit), total }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/roles/templates - Get default role templates
 * MUST be before /roles/:id to prevent Express matching 'templates' as :id
 */
adminRoutes.get('/roles/templates', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:view'), async (req, res) => {
    // Add a stable id so frontend keyed-each blocks don't crash on undefined
    const templates = ACCESS_DEFAULT_ROLES.map(r => ({ ...r, id: r.name }));
    res.json({ success: true, data: templates });
});

/**
 * POST /admin/roles/seed - Seed default roles to database
 * MUST be before /roles/:id to prevent Express matching 'seed' as :id
 */
// Superadmin-only: this seeds/overwrites the shared GLOBAL (tenantId=null)
// role template catalog used as a platform-wide default. It previously only
// required requireAdmin() (roleLevel <= 2, which includes a plain tenant
// owner/store_owner — NOT just true superadmin), and matched an "existing"
// role by NAME ONLY with no tenantId filter — so any tenant owner could
// silently overwrite another tenant's identically-named custom role (or the
// global template) with the hardcoded platform defaults.
adminRoutes.post('/roles/seed', authenticate, withTenantTx(), requireSuperAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const results: any[] = [];

        for (const roleData of ACCESS_DEFAULT_ROLES) {
            const mask = permissionsToMask(roleData.permissions);
            const existing = await db.query.roles.findFirst({ where: and(eq(roles.name, roleData.name), isNull(roles.tenantId)) });

            if (existing) {
                const [updated] = await db.update(roles).set({
                    displayName: roleData.displayName, description: roleData.description,
                    permissions: roleData.permissions, isSystem: roleData.isSystem,
                    level: roleData.level,
                    maskLow: mask.low, maskHigh: mask.high,
                }).where(eq(roles.id, existing.id)).returning();
                results.push({ ...updated, action: 'updated' });
            } else {
                const [created] = await db.insert(roles).values({
                    ...roleData, tenantId: null, maskLow: mask.low, maskHigh: mask.high,
                }).returning();
                results.push({ ...created, action: 'created' });
            }
        }

        await logActivity(req.authUser!.userId, 'roles_seeded', 'ສ້າງບົດບາດເລີ່ມຕົ້ນ', { count: results.length }, req);

        res.json({ success: true, data: results, message: `${results.length} roles seeded` });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/roles/:id - Get single role
 */
adminRoutes.get('/roles/:id', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        const role = await db.query.roles.findFirst({ where: eq(roles.id, id) });

        if (!role) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        res.json({ success: true, data: role });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/roles - Create a new role
 */
adminRoutes.post('/roles', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, displayName, description, permissions, level, tenantId: targetTenantId } = req.body;

        // Super-admin creates a global role (tenantId=null) by default, or a
        // role scoped to a SPECIFIC tenant when they pass one explicitly —
        // this is how a super_admin assigns a real role to a newly-approved
        // store's owner (roles are no longer auto-created at registration
        // time; see POST /admin/requests/:id/approve). Without this, there
        // was no way to create a tenant-scoped role on behalf of a tenant
        // that has no admin of its own yet to do it themselves.
        let roleTenantId: string | null;
        if (req.authUser?.isSuperAdmin) {
            if (targetTenantId) {
                const targetTenant = await db.query.tenants.findFirst({ where: eq(tenants.id, targetTenantId), columns: { id: true } });
                if (!targetTenant) {
                    return res.status(400).json({ success: false, error: { code: 'INVALID_TENANT', message: 'Tenant not found' } });
                }
            }
            roleTenantId = targetTenantId || null;
        } else {
            roleTenantId = req.authUser?.tenantId || req.user?.tenantId || null;
        }

        // Explicit level wins; unset falls back to the matching built-in
        // name's level, then 7 — see roles/presentation/routes.ts POST / for
        // why this is now a persisted DB fact rather than re-derived from
        // name on every read.
        const requestedLevel = Number.isInteger(level) ? Number(level) : (ROLE_LEVELS[name] ?? 7);
        if (requestedLevel < 1 || requestedLevel > 7) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'level must be between 1 and 7' } });
        }

        // Privilege ladder: cannot create a role more privileged than your own.
        const callerLevel = req.authUser?.roleLevel ?? 7;
        if (!req.authUser?.isSuperAdmin && callerLevel > 2) {
            if (requestedLevel < callerLevel) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create a role with higher privileges than your own' } });
            }
        }

        // Branch ownership: branch-level callers (level >= 4 — branch_admin
        // included) may only create roles private to their own branch —
        // never tenant-wide templates. See the matching comment in
        // roles/presentation/routes.ts POST / for why this cutoff is 4, not 5.
        let roleBranchId: string | null = null;
        if (!req.authUser?.isSuperAdmin && callerLevel >= 4) {
            roleBranchId = req.authUser?.activeBranchId || null;
            if (!roleBranchId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No branch context available to create a branch role' } });
            }
        }

        const dupConds: any[] = [eq(roles.name, name)];
        dupConds.push(roleTenantId ? eq(roles.tenantId, roleTenantId) : isNull(roles.tenantId));
        dupConds.push(roleBranchId ? eq(roles.branchId, roleBranchId) : isNull(roles.branchId));
        const existing = await db.query.roles.findFirst({ where: and(...dupConds) });
        if (existing) {
            return res.status(400).json({
                success: false,
                error: { code: 'DUPLICATE', message: 'Role name already exists' }
            });
        }
        const perms = permissions || [];

        // Cannot grant a permission you don't personally hold. ROLE_LEVELS[name]
        // defaults to 7 for any custom (non-builtin) role name, making the
        // ladder check above a no-op for exactly the roles that most need it —
        // this closes the actual escalation path regardless of naming. Same
        // guard as roles/presentation/routes.ts's POST / (that file's roles
        // CRUD and this one are duplicate implementations of the same feature).
        if (!req.authUser?.isSuperAdmin && callerLevel > 2 && !(req.authUser?.permissions || []).includes('*')) {
            const callerPermissions = new Set(req.authUser?.permissions || []);
            const ungranted = perms.filter((p: string) => !callerPermissions.has(p));
            if (ungranted.length > 0) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: `Cannot grant permissions you do not hold: ${ungranted.join(', ')}` }
                });
            }
        }

        const mask = permissionsToMask(perms);
        const [role] = await db.insert(roles).values({
            tenantId: roleTenantId, branchId: roleBranchId, name, displayName, description,
            permissions: perms, isSystem: false, level: requestedLevel,
            maskLow: mask.low, maskHigh: mask.high,
        }).returning();

        // Log activity
        await logActivity(req.authUser!.userId, 'role_created', `ສ້າງບົດບາດ: ${displayName}`, { roleId: role.id }, req);

        res.status(201).json({ success: true, data: role });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /admin/roles/:id - Update a role
 */
adminRoutes.patch('/roles/:id', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { name, displayName, description, permissions, level } = req.body;

        // Tenant + branch scoped lookup — a tenant/branch admin can only touch
        // roles they own (prevents cross-tenant / cross-branch edits).
        const callerLevel = req.authUser?.roleLevel ?? 7;
        const patchConds: any[] = [eq(roles.id, id)];
        if (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) {
            patchConds.push(eq(roles.tenantId, req.authUser.tenantId));
        }
        if (!req.authUser?.isSuperAdmin && callerLevel >= 4) {
            patchConds.push(eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__'));
        }
        const existing = await db.query.roles.findFirst({ where: and(...patchConds) });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        // System roles are immutable; and you cannot edit a role above your level.
        if (existing.isSystem) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify system roles' } });
        }
        // Explicit level wins; unset leaves the role's current DB level
        // unchanged (never re-derived from name).
        let requestedLevel = existing.level;
        if (level !== undefined) {
            if (!Number.isInteger(level) || level < 1 || level > 7) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'level must be between 1 and 7' } });
            }
            requestedLevel = level;
        }
        if (!req.authUser?.isSuperAdmin && callerLevel > 2) {
            if (existing.level < callerLevel || requestedLevel < callerLevel) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify a role with higher privileges than your own' } });
            }
        }

        if (name && name !== existing.name) {
            // Scope duplicate check to the same tenantId as the existing role
            const dupWhere = existing.tenantId
                ? and(eq(roles.name, name), eq(roles.tenantId, existing.tenantId))
                : and(eq(roles.name, name), isNull(roles.tenantId));
            const duplicate = await db.query.roles.findFirst({ where: dupWhere });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Role name already exists' }
                });
            }
        }

        const newPerms = permissions || (existing.permissions as string[]);

        // Same "cannot grant what you don't hold" guard as POST /roles above.
        if (permissions && !req.authUser?.isSuperAdmin && callerLevel > 2 && !(req.authUser?.permissions || []).includes('*')) {
            const callerPermissions = new Set(req.authUser?.permissions || []);
            const ungranted = (permissions as string[]).filter((p: string) => !callerPermissions.has(p));
            if (ungranted.length > 0) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: `Cannot grant permissions you do not hold: ${ungranted.join(', ')}` }
                });
            }
        }

        const mask = permissionsToMask(newPerms);

        const [role] = await db.update(roles).set({
            name: name || existing.name,
            displayName: displayName || existing.displayName,
            description: description !== undefined ? description : existing.description,
            permissions: newPerms,
            level: requestedLevel,
            maskLow: mask.low,
            maskHigh: mask.high,
        }).where(eq(roles.id, id)).returning();

        // Invalidate cached permissions/menu for every user holding this role.
        // invalidateAllTenantPermissions only busts the kpos:rbac:* bitmask
        // cache — it never touches kpos:auth:{userId}, the cache actually
        // read on every authenticated request (menu, permission checks).
        // Same gap as the sibling roles/:id PUT handler — see its comment.
        if (role.tenantId) {
            invalidateAllTenantPermissions(role.tenantId).catch(() => {});
        }
        const affectedUsers = await db.query.users.findMany({
            where: eq(users.roleId, id),
            columns: { id: true },
        });
        await Promise.all(affectedUsers.map(u => invalidateUserStoreCache(u.id).catch(() => {})));

        // Log activity
        await logActivity(req.authUser!.userId, 'role_updated', `ແກ້ໄຂບົດບາດ: ${role.displayName}`, { roleId: role.id }, req);

        res.json({ success: true, data: role });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /admin/roles/:id - Delete a role
 */
adminRoutes.delete('/roles/:id', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        // Tenant + branch scoped lookup/delete — prevents cross-tenant/branch deletion.
        const callerLevel = req.authUser?.roleLevel ?? 7;
        const delConds: any[] = [eq(roles.id, id)];
        if (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) {
            delConds.push(eq(roles.tenantId, req.authUser.tenantId));
        }
        if (!req.authUser?.isSuperAdmin && callerLevel >= 4) {
            delConds.push(eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__'));
        }

        const role = await db.query.roles.findFirst({ where: and(...delConds) });

        if (!role) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Role not found' }
            });
        }

        if (role.isSystem) {
            return res.status(400).json({
                success: false,
                error: { code: 'SYSTEM_ROLE', message: 'Cannot delete system role' }
            });
        }

        const [{ value: userCount }] = await db.select({ value: count() }).from(users).where(eq(users.roleId, id));
        if (userCount > 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'HAS_USERS', message: 'Cannot delete role with assigned users' }
            });
        }

        await db.delete(roles).where(and(...delConds));

        // Log activity
        await logActivity(req.authUser!.userId, 'role_deleted', `ລຶບບົດບາດ: ${role.displayName}`, { roleId: id }, req);

        res.json({ success: true, message: 'Role deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY LOGS & AUDIT
// ═══════════════════════════════════════════════════════════════════════════

const AUDIT_CATEGORY_ACTIONS: Record<string, string[]> = {
    activity: [],
    sales: ['sale_created', 'sale_voided', 'sale_refunded', 'payment_refunded', 'payment_voided'],
    inventory: [
        'inventory_adjusted', 'inventory_transferred', 'transfer_created',
        'transfer_approved', 'transfer_rejected', 'stock_count_approved',
        'stock_count_rejected',
    ],
    staff: ['staff_created', 'staff_updated', 'staff_workflow_updated', 'staff_permissions_updated', 'user_created', 'user_updated', 'user_deleted'],
    access: [
        'role_created', 'role_updated', 'role_deleted', 'role_assigned', 'roles_seeded',
        'rule_created', 'rule_updated', 'rule_deleted', 'role_rules_updated',
        'rules_seeded', 'rules_matrix_saved', 'role_rules_copied',
    ],
    security: ['login', 'logout', 'login_failed', 'session_revoked'],
    finance: [
        'expense_created', 'expense_submitted', 'expense_approved', 'expense_rejected', 'expense_paid',
        'payroll_tax_profile_created', 'payroll_work_policy_created', 'compensation_created',
        'payroll_period_created', 'payroll_calculated', 'payroll_submitted', 'payroll_approved',
        'payroll_rejected', 'payroll_paid', 'payroll_closed', 'payroll_reversed',
        'payroll_adjustment_created', 'payroll_adjustment_approved',
    ],
    approvals: [
        'transfer_approved', 'transfer_rejected', 'stock_count_approved',
        'stock_count_rejected', 'invoice_approved', 'invoice_rejected',
        'tax_invoice_approved', 'tax_invoice_rejected',
        'expense_approved', 'expense_rejected', 'payroll_approved', 'payroll_rejected',
        'payroll_adjustment_approved',
    ],
};

function auditCategoryCondition(category: unknown) {
    const actions = typeof category === 'string' ? AUDIT_CATEGORY_ACTIONS[category] : undefined;
    return actions?.length ? inArray(activityLogs.action, actions) : undefined;
}

function auditScopeCondition(req: any) {
    return buildScopeCondition(
        req.branchFilter,
        { tenantId: activityLogs.tenantId, branchId: activityLogs.branchId, storeId: activityLogs.storeId },
        'storeId',
    );
}

/**
 * Helper function to log activity — publishes to queue if available, else writes sync
 */
async function logActivity(
    userId: string,
    action: string,
    description: string,
    metadata?: Record<string, unknown>,
    req?: any
) {
    try {
        await queueActivityLog(
            userId,
            action,
            action.split('_')[0] || 'admin',
            description,
            metadata || {},
            req,
        );
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
}

/**
 * GET /admin/activity - Get recent activity (for dashboard)
 */
adminRoutes.get('/activity', authenticate, withTenantTx(), requireTenantAdmin(), authorize('admin:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { limit = 10 } = req.query;

        const actConds: any[] = [];
        const tenantScope = buildTenantCondition(req.branchFilter, activityLogs.tenantId);
        if (tenantScope) actConds.push(tenantScope);
        const activities = await db.query.activityLogs.findMany({
            where: actConds.length > 0 ? and(...actConds) : undefined,
            limit: Number(limit),
            orderBy: desc(activityLogs.createdAt),
            with: { user: { columns: { id: true, name: true, email: true } } },
        });

        res.json({ success: true, data: activities });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/audit - Get audit logs with filtering
 */
adminRoutes.get('/audit', authenticate, withTenantTx(), requireTenantAdmin(), authorize('audit:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { search, action, category, userId, dateFrom, dateTo, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const aConds: any[] = [];
        const tenantScope = auditScopeCondition(req);
        if (tenantScope) aConds.push(tenantScope);
        const categoryScope = auditCategoryCondition(category);
        if (categoryScope) aConds.push(categoryScope);
        if (action) aConds.push(eq(activityLogs.action, String(action)));
        if (userId) aConds.push(eq(activityLogs.userId, String(userId)));
        if (dateFrom) aConds.push(gte(activityLogs.createdAt, new Date(String(dateFrom))));
        if (dateTo) aConds.push(lte(activityLogs.createdAt, new Date(String(dateTo) + 'T23:59:59.999Z')));
        if (search) {
            const s = String(search);
            aConds.push(or(ilike(activityLogs.description, `%${s}%`), ilike(activityLogs.action, `%${s}%`)));
        }
        const aWhere = aConds.length > 0 ? and(...aConds) : undefined;

        const [logs, [{ value: total }], stats] = await Promise.all([
            db.query.activityLogs.findMany({
                where: aWhere, offset: skip, limit: Number(limit),
                orderBy: desc(activityLogs.createdAt),
                with: {
                    user: { columns: { id: true, name: true, email: true } },
                    store: { columns: { id: true, name: true } },
                    branch: { columns: { id: true, name: true, code: true } },
                },
            }),
            db.select({ value: count() }).from(activityLogs).where(aWhere),
            Promise.all([
                db.select({ value: count() }).from(activityLogs).where(and(aWhere, ilike(activityLogs.action, '%login%'))),
                db.select({ value: count() }).from(activityLogs).where(and(aWhere, ilike(activityLogs.action, '%updated%'))),
                db.select({ value: count() }).from(activityLogs).where(and(aWhere, ilike(activityLogs.action, '%failed%'))),
            ])
        ]);

        res.json({
            success: true,
            data: logs,
            total,
            stats: {
                logins: stats[0][0].value,
                changes: stats[1][0].value,
                errors: stats[2][0].value,
            },
            meta: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit))
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/audit/export - Export audit logs as CSV
 */
adminRoutes.get('/audit/export', authenticate, withTenantTx(), requireTenantAdmin(), authorize('audit:view'), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { search, action, category, userId, dateFrom, dateTo } = req.query;

        const eConds: any[] = [];
        const tenantScope = auditScopeCondition(req);
        if (tenantScope) eConds.push(tenantScope);
        const categoryScope = auditCategoryCondition(category);
        if (categoryScope) eConds.push(categoryScope);
        if (action) eConds.push(eq(activityLogs.action, String(action)));
        if (userId) eConds.push(eq(activityLogs.userId, String(userId)));
        if (dateFrom) eConds.push(gte(activityLogs.createdAt, new Date(String(dateFrom))));
        if (dateTo) eConds.push(lte(activityLogs.createdAt, new Date(String(dateTo) + 'T23:59:59.999Z')));
        if (search) {
            const s = String(search);
            eConds.push(or(ilike(activityLogs.description, '%' + s + '%'), ilike(activityLogs.action, '%' + s + '%')));
        }
        const eWhere = eConds.length > 0 ? and(...eConds) : undefined;

        const logs = await db.query.activityLogs.findMany({
            where: eWhere, orderBy: desc(activityLogs.createdAt), limit: 10000,
            with: {
                user: { columns: { name: true, email: true } },
                store: { columns: { name: true } },
                branch: { columns: { name: true, code: true } },
            },
        });

        // Generate CSV
        const csvHeader = 'Date,Time,User,Email,Store,Branch,Action,Description,IP\n';
        const csvRows = logs.map(log => {
            const date = new Date(log.createdAt);
            return `"${date.toLocaleDateString()}","${date.toLocaleTimeString()}","${log.user?.name || 'System'}","${log.user?.email || ''}","${log.store?.name || ''}","${log.branch?.name || log.branch?.code || ''}","${log.action}","${log.description || ''}","${log.ip || ''}"`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvHeader + csvRows);
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM HEALTH
/**
 * POST /admin/system/fix-role-permissions
 * Applies the latest default permission sets for system roles (store_owner, hq_admin, admin).
 * Safe to call multiple times (idempotent). Super admin only.
 */
adminRoutes.post('/system/fix-role-permissions', authenticate, withTenantTx(), requireSuperAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branchPerms = ['branches:view', 'branches:create', 'branches:update', 'branches:delete'];
        const roleUpdates: { name: string; addPerms: string[]; removeRuleNames: string[] }[] = [
            { name: 'store_owner', addPerms: branchPerms, removeRuleNames: [] },
            { name: 'hq_admin',   addPerms: branchPerms, removeRuleNames: [] },
            { name: 'admin',      addPerms: [], removeRuleNames: ['sales'] },
        ];

        const report: string[] = [];

        for (const update of roleUpdates) {
            const affectedRoles = await db.query.roles.findMany({ where: eq(roles.name, update.name) });
            for (const role of affectedRoles) {
                const current: string[] = Array.isArray(role.permissions) ? (role.permissions as string[]) : [];
                let updated = [...current];
                for (const p of update.addPerms) {
                    if (!updated.includes(p)) updated.push(p);
                }
                await db.update(roles).set({ permissions: updated }).where(eq(roles.id, role.id));

                // Remove roleRules for sales from admin roles
                if (update.removeRuleNames.length > 0) {
                    const rulesToRemove = await db.query.rules.findMany({
                        where: inArray(rules.name, update.removeRuleNames),
                    });
                    for (const rule of rulesToRemove) {
                        await db.delete(roleRules).where(and(eq(roleRules.roleId, role.id), eq(roleRules.ruleId, rule.id)));
                    }
                }
                report.push(`Updated ${update.name} (tenant: ${role.tenantId || 'system'})`);
            }
        }

        // Invalidate all rule caches
        await invalidateRoleRulesCache('*');
        await invalidateAllUserStoreCache();

        res.json({ success: true, data: { updated: report.length, details: report } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/system/health - Get system health status
 */
adminRoutes.get('/system/health', authenticate, withTenantTx(), requireAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const startTime = Date.now();
        
        // Check database connection
        let dbStatus = 'healthy';
        let dbLatency = 0;
        try {
            const dbStart = Date.now();
            await db.execute(sql`SELECT 1`);
            dbLatency = Date.now() - dbStart;
        } catch {
            dbStatus = 'unhealthy';
        }

        // Get memory usage
        const memUsage = process.memoryUsage();
        const totalMem = totalmem();
        const freeMem = freemem();
        const usedMemPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

        // Calculate uptime
        const uptime = process.uptime();
        const uptimePercent = '99.9%'; // Placeholder

        res.json({
            success: true,
            data: {
                database: {
                    status: dbStatus,
                    latency: dbLatency
                },
                api: {
                    status: 'healthy',
                    uptime: uptimePercent,
                    uptimeSeconds: uptime
                },
                storage: {
                    used: 45, // Placeholder - would need disk usage check
                    total: 100
                },
                memory: {
                    used: usedMemPercent,
                    total: 100,
                    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
                },
                responseTime: Date.now() - startTime
            }
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT (Extended)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/users/:id - Get single user details
 */
adminRoutes.get('/users/:id', authenticate, withTenantTx(), requireSuperAdmin(), authorize('staff:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        // First query: basic user data with branch and role
        const user = await db.query.users.findFirst({
            where: eq(users.id, id),
            columns: { id: true, email: true, name: true, phone: true, role: true, roleId: true, branchId: true, permissions: true, isActive: true, isSuperAdmin: true, lastLoginAt: true, createdAt: true, updatedAt: true },
            with: {
                branch: { columns: { id: true, name: true, code: true } },
                roleRelation: { columns: { id: true, name: true, displayName: true, permissions: true } },
            },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        // Second query: fetch accessible stores separately to avoid nested relation issues
        let accessibleStores: any[] = [];
        try {
            const storeAssignments = await db.query.userStores.findMany({
                where: eq(userStores.userId, id),
                with: { store: { columns: { id: true, name: true, code: true } } },
            });
            accessibleStores = storeAssignments;
        } catch (storeErr) {
            console.error('[Admin] Failed to load accessible stores for user:', id, storeErr);
        }

        res.json({ success: true, data: { ...user, accessibleStores } });
    } catch (error) {
        console.error('[Admin] GET /users/:id error:', error);
        next(error);
    }
});

/**
 * PATCH /admin/users/:id - Update user
 */
adminRoutes.patch('/users/:id', authenticate, withTenantTx(), requireSuperAdmin(), authorize('staff:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { name, email, phone, roleId, branchId, permissions, isActive } = req.body;

        const existing = await db.query.users.findFirst({ where: eq(users.id, id) });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        if (email && email !== existing.email) {
            const duplicate = await db.query.users.findFirst({ where: eq(users.email, email) });
            if (duplicate) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DUPLICATE', message: 'Email already exists' }
                });
            }
        }

        // Tenant scoping: System Admins can only update users within their own tenant
        if (!req.authUser!.isSuperAdmin && req.authUser!.tenantId) {
            if (existing.tenantId && existing.tenantId !== req.authUser!.tenantId) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify user from another tenant' } });
            }
        }

        let roleName = existing.role;
        let resolvedRoleId = roleId;
        if (roleId) {
            // Tenant-scoped lookup — see POST /admin/users for why this matters.
            const roleConds = [eq(roles.id, roleId)];
            if (!req.authUser!.isSuperAdmin && req.authUser!.tenantId) roleConds.push(eq(roles.tenantId, req.authUser!.tenantId));
            const role = await db.query.roles.findFirst({ where: and(...roleConds) });
            if (role) {
                roleName = role.name;
            } else {
                resolvedRoleId = undefined;
            }
        }

        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (roleId !== undefined && resolvedRoleId !== undefined) { updateData.roleId = resolvedRoleId; updateData.role = roleName; }
        if (branchId !== undefined) updateData.branchId = branchId;
        if (permissions !== undefined && Array.isArray(permissions)) {
            // Cannot grant a permission the caller doesn't personally hold —
            // same escalation guard as POST /admin/users above.
            const rawPermissions = permissions.filter((p: unknown) => typeof p === 'string');
            updateData.permissions = req.authUser!.isSuperAdmin || (req.authUser!.permissions || []).includes('*')
                ? rawPermissions
                : rawPermissions.filter((p: string) => (req.authUser!.permissions || []).includes(p));
        }
        if (isActive !== undefined) updateData.isActive = isActive;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, error: { code: 'NO_CHANGES', message: 'No fields to update' } });
        }

        await db.update(users).set(updateData).where(eq(users.id, id));
        const user = await db.query.users.findFirst({
            where: eq(users.id, id),
            columns: { id: true, email: true, name: true, phone: true, role: true, isActive: true, isSuperAdmin: true, createdAt: true },
            with: { branch: { columns: { id: true, name: true } }, roleRelation: { columns: { id: true, name: true, displayName: true } } },
        });

        if (!user) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found after update' } });
        }

        // Log activity
        await logActivity(req.authUser!.userId, 'user_updated', `ແກ້ໄຂຜູ້ໃຊ້: ${user.name}`, { targetUserId: id }, req).catch(() => {});

        res.json({ success: true, data: user });
    } catch (error) {
        console.error('[Admin] PATCH /users/:id error:', error);
        next(error);
    }
});

/**
 * DELETE /admin/users/:id - Deactivate user
 */
adminRoutes.delete('/users/:id', authenticate, withTenantTx(), requireSuperAdmin(), authorize('staff:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;

        // Prevent self-deletion
        if (id === req.authUser!.userId) {
            return res.status(400).json({
                success: false,
                error: { code: 'SELF_DELETE', message: 'Cannot delete yourself' }
            });
        }

        const delUserScope = tenantScope(req, users.tenantId);
        const user = await db.query.users.findFirst({
            where: delUserScope ? and(eq(users.id, id), delUserScope) : eq(users.id, id),
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });
        }

        await db.update(users).set({ isActive: false }).where(eq(users.id, id));

        // Log activity
        await logActivity(req.authUser!.userId, 'user_deleted', `ປິດການໃຊ້ງານຜູ້ໃຊ້: ${user.name}`, { targetUserId: id }, req);

        res.json({ success: true, message: 'User deactivated successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /admin/users/:id/super-admin - Toggle Super Admin (alternative endpoint)
 *
 * Platform-superadmin only — requireAdmin() (roleLevel <= 2) would let any regular
 * tenant admin (e.g. merchant_owner) grant platform-wide superadmin to an arbitrary
 * user by id. Granting this specific privilege must never be tenant-scoped.
 */
adminRoutes.patch('/users/:id/super-admin', authenticate, withTenantTx(), requireSuperAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { isSuperAdmin: newStatus } = req.body;

        // Prevent self-demotion
        if (id === req.authUser!.userId && newStatus === false) {
            return res.status(400).json({
                success: false,
                error: { code: 'SELF_DEMOTION', message: 'Cannot remove your own Super Admin status' }
            });
        }

        const [user] = await db.update(users).set({ isSuperAdmin: Boolean(newStatus) }).where(eq(users.id, id)).returning({ id: users.id, name: users.name, email: users.email, isSuperAdmin: users.isSuperAdmin });

        const action = newStatus ? 'ເພີ່ມ Super Admin' : 'ຖອນ Super Admin';
        await logActivity(req.authUser!.userId, 'user_updated', `${action}: ${user.name}`, { targetUserId: id }, req);

        res.json({ success: true, data: user });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM ENUMS MANAGEMENT (Admin CRUD for dropdown values)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/enums/seed - Seed all enum values into DB from hardcoded defaults
 */
adminRoutes.post('/enums/seed', authenticate, withTenantTx(), requireAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        let inserted = 0;
        let skipped = 0;
        for (const [type, entries] of Object.entries(ENUM_SEED_DATA)) {
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                const existing = await db.query.systemEnums.findFirst({
                    where: and(eq(systemEnums.type, type), eq(systemEnums.value, e.value)),
                });
                if (!existing) {
                    await db.insert(systemEnums).values({
                        type, value: e.value, label: e.label, labelLao: e.labelLao,
                        order: i, isSystem: e.isSystem ?? true, isActive: true,
                    });
                    inserted++;
                } else {
                    skipped++;
                }
            }
        }
        res.json({ success: true, data: { inserted, skipped } });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/enums - List all enum types or a specific type
 */
adminRoutes.get('/enums', authenticate, withTenantTx(), requireAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { type } = req.query;
        const rows = await db.query.systemEnums.findMany({
            where: type ? eq(systemEnums.type, String(type)) : undefined,
            orderBy: [asc(systemEnums.type), asc(systemEnums.order), asc(systemEnums.label)],
        });

        // Return as grouped by type
        const grouped: Record<string, any[]> = {};
        for (const row of rows) {
            if (!grouped[row.type]) grouped[row.type] = [];
            grouped[row.type].push(row);
        }

        // Also return list of all types
        const types = [...new Set(rows.map(r => r.type))].sort();

        res.json({ success: true, data: { types, grouped, flat: rows } });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/enums - Create a new enum value
 */
adminRoutes.post('/enums', authenticate, withTenantTx(), requireAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { type, value, label, labelLao, order = 0, isActive = true } = req.body;
        if (!type || !value || !label) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'type, value, label are required' } });
        }
        const existing = await db.query.systemEnums.findFirst({
            where: and(eq(systemEnums.type, String(type)), eq(systemEnums.value, String(value))),
        });
        if (existing) {
            return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Enum value already exists for this type' } });
        }
        const [created] = await db.insert(systemEnums).values({
            type: String(type), value: String(value), label: String(label),
            labelLao: labelLao ? String(labelLao) : undefined,
            order: Number(order), isActive: Boolean(isActive), isSystem: false,
        }).returning();
        res.status(201).json({ success: true, data: created });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/enums/:id - Update an enum value
 */
adminRoutes.put('/enums/:id', authenticate, withTenantTx(), requireAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { label, labelLao, order, isActive } = req.body;
        const existing = await db.query.systemEnums.findFirst({ where: eq(systemEnums.id, id) });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Enum not found' } });
        }
        const [updated] = await db.update(systemEnums).set({
            ...(label !== undefined && { label: String(label) }),
            ...(labelLao !== undefined && { labelLao: String(labelLao) }),
            ...(order !== undefined && { order: Number(order) }),
            ...(isActive !== undefined && { isActive: Boolean(isActive) }),
            updatedAt: new Date(),
        }).where(eq(systemEnums.id, id)).returning();
        res.json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /admin/enums/:id - Delete a non-system enum value
 */
adminRoutes.delete('/enums/:id', authenticate, withTenantTx(), requireAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const existing = await db.query.systemEnums.findFirst({ where: eq(systemEnums.id, id) });
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Enum not found' } });
        }
        if (existing.isSystem) {
            return res.status(400).json({ success: false, error: { code: 'SYSTEM_ENUM', message: 'System enums cannot be deleted. Disable them instead.' } });
        }
        await db.delete(systemEnums).where(eq(systemEnums.id, id));
        res.json({ success: true, data: { message: 'Deleted successfully' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT PERMISSION GROUPS (CRUD structure matching ALL_PERMISSIONS)
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PERMISSION_GROUPS = [
    {
        key: "printing", label: "Printing", icon: "Printer", color: "from-cyan-500 to-blue-500",
        permissions: [
            { key: "printing:view", label: "View print jobs" },
            { key: "printing:receipt", label: "Print receipts" },
            { key: "printing:label", label: "Print barcode labels" },
            { key: "printing:reprint", label: "Retry and reprint jobs" },
            { key: "printing:manage", label: "Manage printers" },
        ]
    },
    {
        key: "dashboard", label: "ແຜງຄວບຄຸມ", icon: "LayoutDashboard", color: "from-indigo-500 to-blue-500",
        permissions: [
            { key: "dashboard:view", label: "ເບິ່ງແຜງຄວບຄຸມ" },
        ]
    },
    {
        key: "pos", label: "ຂາຍໜ້າຮ້ານ (POS)", icon: "ShoppingCart", color: "from-emerald-500 to-green-500",
        permissions: [
            { key: "pos:access", label: "ເຂົ້າໃຊ້ POS" },
            { key: "pos:discount", label: "ໃຫ້ສ່ວນຫຼຸດ" },
            { key: "pos:void", label: "ຍົກເລີກລາຍການ" },
            { key: "pos:credit", label: "ຂາຍສິນເຊື່ອ" },
        ]
    },
    {
        key: "sales", label: "ການຂາຍ", icon: "ShoppingBag", color: "from-teal-500 to-emerald-500",
        permissions: [
            { key: "sales:view", label: "ເບິ່ງການຂາຍ" },
            { key: "sales:create", label: "ສ້າງການຂາຍ" },
            { key: "sales:update", label: "ແກ້ໄຂການຂາຍ" },
            { key: "sales:delete", label: "ລຶບການຂາຍ" },
            { key: "sales:void", label: "ຍົກເລີກບິນ" },
            { key: "sales:refund", label: "ຄືນເງິນ" },
        ]
    },
    {
        key: "products", label: "ສິນຄ້າ", icon: "Package", color: "from-blue-500 to-cyan-500",
        permissions: [
            { key: "products:view", label: "ເບິ່ງສິນຄ້າ" },
            { key: "products:create", label: "ເພີ່ມສິນຄ້າ" },
            { key: "products:update", label: "ແກ້ໄຂສິນຄ້າ" },
            { key: "products:delete", label: "ລຶບສິນຄ້າ" },
        ]
    },
    {
        key: "categories", label: "ໝວດໝູ່", icon: "Tags", color: "from-sky-500 to-blue-500",
        permissions: [
            { key: "categories:view", label: "ເບິ່ງໝວດໝູ່" },
            { key: "categories:create", label: "ເພີ່ມໝວດໝູ່" },
            { key: "categories:update", label: "ແກ້ໄຂໝວດໝູ່" },
            { key: "categories:delete", label: "ລຶບໝວດໝູ່" },
        ]
    },
    {
        key: "inventory", label: "ສາງສິນຄ້າ", icon: "Boxes", color: "from-amber-500 to-orange-500",
        permissions: [
            { key: "inventory:view", label: "ເບິ່ງສາງ" },
            { key: "inventory:create", label: "ນຳເຂົ້າ/ນຳອອກ" },
            { key: "inventory:update", label: "ແກ້ໄຂສາງ" },
            { key: "inventory:delete", label: "ລຶບສາງ" },
            { key: "inventory:transfer", label: "ໂອນຍ້າຍສິນຄ້າ" },
            { key: "inventory:adjust", label: "ປັບປ່ຽນສະຕ໋ອກ" },
            { key: "inventory:stockin", label: "ນຳເຂົ້າສິນຄ້າ" },
            { key: "inventory:stockout", label: "ນຳອອກສິນຄ້າ" },
        ]
    },
    {
        key: "customers", label: "ລູກຄ້າ (CRM)", icon: "Users", color: "from-rose-500 to-pink-500",
        permissions: [
            { key: "customers:view", label: "ເບິ່ງລູກຄ້າ" },
            { key: "customers:create", label: "ເພີ່ມລູກຄ້າ" },
            { key: "customers:update", label: "ແກ້ໄຂລູກຄ້າ" },
            { key: "customers:delete", label: "ລຶບລູກຄ້າ" },
        ]
    },
    {
        key: "promotions", label: "ໂປຣໂມຊັ່ນ", icon: "Gift", color: "from-fuchsia-500 to-purple-500",
        permissions: [
            { key: "promotions:view", label: "ເບິ່ງໂປຣໂມຊັ່ນ" },
            { key: "promotions:create", label: "ສ້າງໂປຣໂມຊັ່ນ" },
            { key: "promotions:update", label: "ແກ້ໄຂໂປຣໂມຊັ່ນ" },
            { key: "promotions:delete", label: "ລຶບໂປຣໂມຊັ່ນ" },
        ]
    },
    {
        key: "payments", label: "ການຊຳລະ", icon: "Wallet", color: "from-lime-500 to-green-500",
        permissions: [
            { key: "payments:view", label: "ເບິ່ງການຊຳລະ" },
            { key: "payments:create", label: "ສ້າງການຊຳລະ" },
            { key: "payments:void", label: "ຍົກເລີກການຊຳລະ" },
            { key: "payments:settle", label: "ປິດບັນຊີ" },
            { key: "payments:manage", label: "ຈັດການການຊຳລະ" },
        ]
    },
    {
        key: "documents", label: "ເອກະສານ", icon: "FileText", color: "from-cyan-500 to-teal-500",
        permissions: [
            { key: "documents:view", label: "ເບິ່ງເອກະສານ" },
            { key: "documents:create", label: "ສ້າງເອກະສານ" },
            { key: "documents:update", label: "ແກ້ໄຂເອກະສານ" },
            { key: "documents:delete", label: "ລຶບເອກະສານ" },
        ]
    },
    {
        key: "reports", label: "ລາຍງານ", icon: "BarChart3", color: "from-violet-500 to-purple-500",
        permissions: [
            { key: "reports:view", label: "ເບິ່ງລາຍງານ" },
            { key: "reports:sales", label: "ລາຍງານຂາຍ" },
            { key: "reports:inventory", label: "ລາຍງານສາງ" },
            { key: "reports:financial", label: "ລາຍງານການເງິນ" },
            { key: "reports:staff", label: "ລາຍງານພະນັກງານ" },
        ]
    },
    {
        key: "staff", label: "ພະນັກງານ", icon: "UserCog", color: "from-orange-500 to-red-500",
        permissions: [
            { key: "staff:view", label: "ເບິ່ງພະນັກງານ" },
            { key: "staff:create", label: "ເພີ່ມພະນັກງານ" },
            { key: "staff:update", label: "ແກ້ໄຂພະນັກງານ" },
            { key: "staff:delete", label: "ລຶບພະນັກງານ" },
        ]
    },
    {
        key: "attendance", label: "ການເຂົ້າວຽກ", icon: "CalendarClock", color: "from-emerald-500 to-teal-500",
        permissions: [
            { key: "attendance:clock", label: "ເຂົ້າ / ອອກວຽກຂອງຕົນເອງ" },
            { key: "attendance:view", label: "ເບິ່ງບັນທຶກເວລາພະນັກງານ" },
            { key: "attendance:manage", label: "ເພີ່ມ ແກ້ ແລະຍົກເລີກບັນທຶກເວລາ" },
        ]
    },
    {
        key: "roles", label: "ບົດບາດ", icon: "Key", color: "from-yellow-500 to-amber-500",
        permissions: [
            { key: "roles:view", label: "ເບິ່ງບົດບາດ" },
            { key: "roles:create", label: "ສ້າງບົດບາດ" },
            { key: "roles:update", label: "ແກ້ໄຂບົດບາດ" },
            { key: "roles:delete", label: "ລຶບບົດບາດ" },
        ]
    },
    {
        key: "branches", label: "ສາຂາ", icon: "Building2", color: "from-stone-500 to-zinc-500",
        permissions: [
            { key: "branches:view", label: "ເບິ່ງສາຂາ" },
            { key: "branches:create", label: "ສ້າງສາຂາ" },
            { key: "branches:update", label: "ແກ້ໄຂສາຂາ" },
            { key: "branches:delete", label: "ລຶບສາຂາ" },
        ]
    },
    {
        key: "stores", label: "ຮ້ານຄ້າ", icon: "Store", color: "from-emerald-500 to-teal-500",
        permissions: [
            { key: "stores:view", label: "ເບິ່ງຮ້ານຄ້າ" },
            { key: "stores:create", label: "ສ້າງຮ້ານຄ້າ" },
            { key: "stores:update", label: "ແກ້ໄຂຮ້ານຄ້າ" },
            { key: "stores:delete", label: "ລຶບຮ້ານຄ້າ" },
        ]
    },
    {
        key: "settings", label: "ຕັ້ງຄ່າ", icon: "Settings", color: "from-gray-500 to-slate-500",
        permissions: [
            { key: "settings:view", label: "ເບິ່ງຕັ້ງຄ່າ" },
            { key: "settings:update", label: "ແກ້ໄຂຕັ້ງຄ່າ" },
        ]
    },
    {
        key: "restaurant", label: "ຮ້ານອາຫານ", icon: "UtensilsCrossed", color: "from-pink-500 to-rose-500",
        permissions: [
            { key: "restaurant:view", label: "ເບິ່ງຮ້ານອາຫານ" },
            { key: "restaurant:manage", label: "ຈັດການຮ້ານອາຫານ" },
            { key: "tables:create", label: "ສ້າງໂຕະ" },
            { key: "tables:update", label: "ແກ້ໄຂໂຕະ" },
            { key: "tables:delete", label: "ລຶບໂຕະ" },
        ]
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// MENU PERMISSIONS (Tree Structure)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default menu structure for the system
 */
const DEFAULT_MENU_STRUCTURE = [
    {
        key: "dashboard",
        label: "Dashboard",
        labelLao: "ແຜງຄວບຄຸມ",
        icon: "LayoutDashboard",
        path: "/dashboard",
        requiredPermission: "dashboard:view",
        children: []
    },
    {
        key: "sales",
        label: "Sales",
        labelLao: "ຂາຍ",
        icon: "ShoppingCart",
        requiredPermission: "sales:create",
        children: [
            { key: "sales.pos", label: "POS", labelLao: "ໜ້າຂາຍ POS", icon: "ShoppingCart", path: "/pos", requiredPermission: "sales:create" },
            { key: "sales.pos_fullscreen", label: "POS Fullscreen", labelLao: "ໜ້າຂາຍເຕັມຈໍ", icon: "Monitor", path: "/pos?mode=fullscreen", requiredPermission: "sales:create" },
            { key: "sales.credit", label: "Credit Sales", labelLao: "ຂາຍສິນເຊື່ອ", icon: "CreditCard", path: "/pos/credit", requiredPermission: "sales:create" },
            { key: "sales.held", label: "Held Orders", labelLao: "ບິນທີ່ພັກໄວ້", icon: "ClipboardList", path: "/pos/held", requiredPermission: "sales:create" },
            { key: "sales.display", label: "Customer Display", labelLao: "ຈໍລູກຄ້າ", icon: "Monitor", path: "/display/customer", requiredPermission: "sales:view" },
        ]
    },
    {
        key: "products",
        label: "Products",
        labelLao: "ສິນຄ້າ",
        icon: "Package",
        requiredPermission: "products:view",
        children: [
            { key: "products.list", label: "Product List", labelLao: "ລາຍການສິນຄ້າ", icon: "Package", path: "/products", requiredPermission: "products:view" },
            { key: "products.categories", label: "Categories", labelLao: "ໝວດໝູ່", icon: "Tags", path: "/categories", requiredPermission: "categories:view" },
            { key: "products.barcode", label: "Barcode/QR", labelLao: "Barcode / QR Code", icon: "Barcode", path: "/barcode", requiredPermission: "products:view" },
            { key: "products.sku", label: "SKU/Variants", labelLao: "SKU / ຕົວເລືອກ", icon: "Layers", path: "/products/sku", requiredPermission: "products:view" },
            { key: "products.pricing", label: "Pricing", labelLao: "ລະດັບລາຄາ", icon: "DollarSign", path: "/products/pricing", requiredPermission: "products:update" },
        ]
    },
    {
        key: "inventory",
        label: "Inventory",
        labelLao: "ສາງ",
        icon: "Boxes",
        requiredPermission: "inventory:view",
        children: [
            { key: "inventory.stock", label: "Stock", labelLao: "ສາງສິນຄ້າ", icon: "Boxes", path: "/inventory", requiredPermission: "inventory:view" },
            { key: "inventory.stockin", label: "Stock In", labelLao: "ນຳເຂົ້າສິນຄ້າ", icon: "TrendingUp", path: "/inventory/stockin", requiredPermission: "inventory:create" },
            { key: "inventory.stockout", label: "Stock Out", labelLao: "ນຳອອກສິນຄ້າ", icon: "TrendingDown", path: "/inventory/stockout", requiredPermission: "inventory:create" },
            { key: "inventory.adjust", label: "Adjust", labelLao: "ປັບປ່ຽນສະຕ໋ອກ", icon: "Scale", path: "/inventory/adjust", requiredPermission: "inventory:update" },
            { key: "inventory.transfer", label: "Transfer", labelLao: "ໂອນຍ້າຍສິນຄ້າ", icon: "ArrowRightLeft", path: "/inventory/transfer", requiredPermission: "inventory:transfer" },
            { key: "inventory.count", label: "Stock Count", labelLao: "ກວດນັບສະຕ໋ອກ", icon: "ClipboardCheck", path: "/inventory/count", requiredPermission: "inventory:adjust" },
            { key: "inventory.po", label: "Purchase Orders", labelLao: "ສັ່ງຊື້ (PO)", icon: "ClipboardList", path: "/inventory/purchase-orders", requiredPermission: "inventory:create" },
            { key: "inventory.vendors", label: "Vendors", labelLao: "ຜູ້ສະໜອງ", icon: "Truck", path: "/inventory/vendors", requiredPermission: "inventory:view" },
            { key: "inventory.expiry", label: "Expiry", labelLao: "ວັນໝົດອາຍຸ", icon: "CalendarClock", path: "/inventory/expiry", requiredPermission: "inventory:view" },
            { key: "inventory.outofstock", label: "Out of Stock", labelLao: "ສິນຄ້າໝົດສະຕ໋ອກ", icon: "PackageX", path: "/inventory/out-of-stock", requiredPermission: "inventory:view" },
        ]
    },
    {
        key: "restaurant",
        label: "Restaurant",
        labelLao: "ຮ້ານອາຫານ",
        icon: "UtensilsCrossed",
        requiredPermission: "restaurant:view",
        children: [
            { key: "restaurant.tables", label: "Tables", labelLao: "ໂຕະ", icon: "Table", path: "/restaurant/tables", requiredPermission: "restaurant:view" },
            { key: "restaurant.orders", label: "Orders", labelLao: "ອໍເດີ", icon: "ClipboardList", path: "/restaurant/orders", requiredPermission: "restaurant:view" },
            { key: "restaurant.kitchen", label: "Kitchen (KDS)", labelLao: "ຄົວ (KDS)", icon: "ChefHat", path: "/restaurant/kitchen", requiredPermission: "restaurant:manage" },
            { key: "restaurant.reservations", label: "Reservations", labelLao: "ຈອງໂຕະ", icon: "CalendarClock", path: "/restaurant/reservations", requiredPermission: "restaurant:view" },
            { key: "restaurant.emenu", label: "e-Menu", labelLao: "e-Menu", icon: "QrCode", path: "/restaurant/e-menu", requiredPermission: "restaurant:view" },
        ]
    },
    {
        key: "promotions",
        label: "Promotions",
        labelLao: "ໂປຣໂມຊັ່ນ",
        icon: "Gift",
        requiredPermission: "promotions:view",
        children: [
            { key: "promotions.list", label: "Promotions", labelLao: "ໂປຣໂມຊັ່ນ", icon: "Gift", path: "/promotions", requiredPermission: "promotions:view" },
            { key: "promotions.coupons", label: "Coupons", labelLao: "ຄູປອງ", icon: "TicketPercent", path: "/promotions/coupons", requiredPermission: "promotions:view" },
            { key: "promotions.discounts", label: "Discounts", labelLao: "ສ່ວນຫຼຸດ", icon: "Percent", path: "/promotions/discounts", requiredPermission: "promotions:view" },
        ]
    },
    {
        key: "customers",
        label: "Customers (CRM)",
        labelLao: "ລູກຄ້າ (CRM)",
        icon: "Users",
        requiredPermission: "customers:view",
        children: [
            { key: "customers.list", label: "Customers", labelLao: "ລູກຄ້າ", icon: "Users", path: "/customers", requiredPermission: "customers:view" },
            { key: "customers.members", label: "Members", labelLao: "ສະມາຊິກ", icon: "Crown", path: "/customers/members", requiredPermission: "customers:view" },
            { key: "customers.points", label: "Points", labelLao: "ຄະແນນສະສົມ", icon: "Star", path: "/customers/points", requiredPermission: "customers:view" },
            { key: "customers.loyalty", label: "Loyalty Program", labelLao: "ໂປຣແກຣມ Loyalty", icon: "Heart", path: "/customers/loyalty", requiredPermission: "customers:update" },
        ]
    },
    {
        key: "payments",
        label: "Payments",
        labelLao: "ການຊຳລະ",
        icon: "Wallet",
        requiredPermission: "payments:view",
        children: [
            { key: "payments.methods", label: "Payment Methods", labelLao: "ວິທີຊຳລະ", icon: "CreditCard", path: "/payments", requiredPermission: "payments:view" },
            { key: "payments.transactions", label: "Transactions", labelLao: "ລາຍການຊຳລະ", icon: "Receipt", path: "/payments/transactions", requiredPermission: "payments:view" },
            { key: "payments.settlements", label: "Settlements", labelLao: "ປິດບັນຊີ", icon: "DollarSign", path: "/payments/settlements", requiredPermission: "payments:manage" },
        ]
    },
    {
        key: "documents",
        label: "Documents",
        labelLao: "ເອກະສານ",
        icon: "FileText",
        requiredPermission: "documents:view",
        children: [
            { key: "documents.receipts", label: "Receipts", labelLao: "ໃບບິນ", icon: "Receipt", path: "/documents", requiredPermission: "documents:view" },
            { key: "documents.design", label: "Receipt Design", labelLao: "ອອກແບບໃບບິນ", icon: "Printer", path: "/documents/design", requiredPermission: "documents:update" },
            { key: "documents.invoices", label: "Invoices", labelLao: "ໃບແຈ້ງໜີ້", icon: "FileText", path: "/documents/invoices", requiredPermission: "documents:view" },
            { key: "documents.tax", label: "Tax Invoices", labelLao: "ໃບກຳກັບພາສີ", icon: "FileSpreadsheet", path: "/documents/tax-invoices", requiredPermission: "documents:view" },
        ]
    },
    {
        key: "reports",
        label: "Reports",
        labelLao: "ລາຍງານ",
        icon: "BarChart3",
        requiredPermission: "reports:view",
        children: [
            { key: "reports.sales", label: "Sales Report", labelLao: "ລາຍງານການຂາຍ", icon: "BarChart3", path: "/reports", requiredPermission: "reports:sales" },
            { key: "reports.products", label: "Product Report", labelLao: "ລາຍງານສິນຄ້າ", icon: "Package", path: "/reports/products", requiredPermission: "reports:products" },
            { key: "reports.inventory", label: "Inventory Report", labelLao: "ລາຍງານສາງ", icon: "Boxes", path: "/reports/inventory", requiredPermission: "reports:inventory" },
            { key: "reports.financial", label: "Financial Report", labelLao: "ລາຍງານການເງິນ", icon: "DollarSign", path: "/reports/financial", requiredPermission: "reports:financial" },
            { key: "reports.staff", label: "Staff Report", labelLao: "ລາຍງານພະນັກງານ", icon: "UserCog", path: "/reports/staff", requiredPermission: "reports:staff" },
            { key: "reports.customers", label: "Customer Report", labelLao: "ລາຍງານລູກຄ້າ", icon: "Users", path: "/reports/customers", requiredPermission: "reports:customers" },
        ]
    },
    {
        key: "management",
        label: "Management",
        labelLao: "ຈັດການ",
        icon: "Building2",
        requiredPermission: "staff:view",
        children: [
            { key: "management.branches", label: "Branches", labelLao: "ສາຂາ", icon: "Building2", path: "/branches", requiredPermission: "branches:view" },
            { key: "management.stores", label: "Stores", labelLao: "ຮ້ານຄ້າ", icon: "Store", path: "/management/stores", requiredPermission: "stores:view" },
            { key: "management.staff", label: "Staff", labelLao: "ພະນັກງານ", icon: "Users", path: "/staff", requiredPermission: "staff:view" },
            { key: "management.attendance", label: "Attendance", labelLao: "ບັນທຶກເຂົ້າວຽກ", icon: "CalendarClock", path: "/staff/attendance" },
            { key: "management.roles", label: "Roles", labelLao: "ບົດບາດ", icon: "Key", path: "/staff/roles", requiredPermission: "roles:view" },
            { key: "management.shifts", label: "Cash Shifts", labelLao: "ກະເງິນສົດ", icon: "Banknote", path: "/staff/shifts", requiredPermission: "sales:create" },
            { key: "management.registers", label: "Cash Registers", labelLao: "ເຄື່ອງຄິດເງິນ", icon: "Monitor", path: "/management/cashregisters", requiredPermission: "settings:view" },
        ]
    },
    {
        key: "settings",
        label: "Settings",
        labelLao: "ຕັ້ງຄ່າ",
        icon: "Settings",
        requiredPermission: "settings:view",
        children: [
            { key: "settings.general", label: "General", labelLao: "ທົ່ວໄປ", icon: "Settings", path: "/settings", requiredPermission: "settings:view" },
            { key: "settings.display", label: "Display", labelLao: "ຈໍສະແດງ", icon: "Monitor", path: "/settings/display", requiredPermission: "settings:view" },
            { key: "settings.receipt", label: "Receipt Settings", labelLao: "ຕັ້ງຄ່າໃບບິນ", icon: "Receipt", path: "/settings/receipt", requiredPermission: "settings:update" },
            { key: "settings.payment", label: "Payment Settings", labelLao: "ຕັ້ງຄ່າການຊຳລະ", icon: "CreditCard", path: "/settings/payments", requiredPermission: "settings:update" },
            { key: "settings.printer", label: "Printer Settings", labelLao: "ຕັ້ງຄ່າເຄື່ອງພິມ", icon: "Printer", path: "/settings/printers", requiredPermission: "settings:update" },
            { key: "settings.tax", label: "Tax Settings", labelLao: "ຕັ້ງຄ່າອາກອນ", icon: "Percent", path: "/settings/tax", requiredPermission: "settings:update" },
            { key: "settings.notifications", label: "Notifications", labelLao: "ການແຈ້ງເຕືອນ", icon: "Bell", path: "/settings/notifications", requiredPermission: "settings:view" },
            { key: "settings.integrations", label: "Integrations", labelLao: "ເຊື່ອມຕໍ່", icon: "Plug", path: "/settings/integrations", requiredPermission: "settings:update" },
        ]
    },
    {
        key: "super-admin",
        label: "Super Admin",
        labelLao: "Super Admin",
        icon: "ShieldCheck",
        requiredPermission: "admin:view",
        children: [
            { key: "super-admin.dashboard", label: "Admin Dashboard", labelLao: "ແຜງຄວບຄຸມ", icon: "Shield", path: "/admin", requiredPermission: "admin:view" },
            { key: "super-admin.requests", label: "Store Requests", labelLao: "ຄຳຂໍເປີດຮ້ານ", icon: "FileCheck", path: "/admin/requests", requiredPermission: "admin:view" },
            { key: "super-admin.branches", label: "All Branches", labelLao: "ຈັດການສາຂາ", icon: "Building2", path: "/admin/branches", requiredPermission: "admin:view" },
            { key: "super-admin.users", label: "All Users", labelLao: "ຈັດການຜູ້ໃຊ້", icon: "Users", path: "/admin/users", requiredPermission: "admin:view" },
            { key: "super-admin.roles", label: "System Roles", labelLao: "ຈັດການບົດບາດ", icon: "Key", path: "/admin/roles", requiredPermission: "admin:manage" },
            { key: "super-admin.permissions", label: "Permissions", labelLao: "ຈັດການສິດ", icon: "Shield", path: "/admin/permissions", requiredPermission: "admin:manage" },
            {
                key: "super-admin.audit", label: "Audit", labelLao: "ກວດສອບ Audit", icon: "History",
                requiredPermission: "audit:view",
                children: [
                    { key: "super-admin.audit.overview", label: "Overview", labelLao: "ພາບລວມ", icon: "LayoutDashboard", path: "/admin/audit", requiredPermission: "audit:view" },
                    { key: "super-admin.audit.activity", label: "Activity Log", labelLao: "ປະຫວັດການກະທຳ", icon: "Activity", path: "/admin/audit?view=activity", requiredPermission: "audit:view" },
                    { key: "super-admin.audit.sales", label: "Sales Audit", labelLao: "ກວດການຂາຍ", icon: "ShoppingCart", path: "/admin/audit?view=sales", requiredPermission: "audit:view" },
                    { key: "super-admin.audit.inventory", label: "Inventory Audit", labelLao: "ກວດສາງສິນຄ້າ", icon: "Boxes", path: "/admin/audit?view=inventory", requiredPermission: "audit:view" },
                    { key: "super-admin.audit.staff", label: "Staff Audit", labelLao: "ກວດກາພະນັກງານ", icon: "Users", path: "/admin/audit?view=staff", requiredPermission: "audit:view" },
                    { key: "super-admin.audit.access", label: "Access Audit", labelLao: "ກວດ Roles / Rules / Permissions", icon: "Key", path: "/admin/audit?view=access", requiredPermission: "audit:view" },
                    { key: "super-admin.audit.approvals", label: "Maker-Checker", labelLao: "ກວດ Maker-Checker", icon: "ShieldCheck", path: "/admin/audit?view=approvals", requiredPermission: "audit:view" },
                    { key: "super-admin.audit.security", label: "Security Audit", labelLao: "ກວດຄວາມປອດໄພ", icon: "Lock", path: "/admin/audit?view=security", requiredPermission: "audit:view" },
                ],
            },
        ]
    },
    {
        // Self-service page for users with no store access yet to submit a
        // request. No requiredPermission — a store-less user by definition
        // has no stores:* permission, so gating this behind one would make
        // it permanently unreachable for exactly the people who need it.
        key: "store-request",
        label: "Store Request",
        labelLao: "ຂໍເປີດຮ້ານ/ສາຂາ",
        icon: "Store",
        path: "/store-request",
    },
    {
        key: "help",
        label: "Help",
        labelLao: "ຊ່ວຍເຫຼືອ",
        icon: "HelpCircle",
        path: "/help",
    },
];

// CRUD controls the standard action suffixes only. Fine-grained actions such
// as void, refund, export and transfer remain explicit permissions and are
// intentionally not inferred from a broad CRUD checkbox.
function crudPermissionFlag(permission: string, crud: { r: boolean; c: boolean; u: boolean; d: boolean }): boolean | null {
    const action = permission.split(':').pop()?.toLowerCase();
    if (action === 'view' || action === 'read' || action === 'list') return crud.r;
    if (action === 'create' || action === 'add') return crud.c;
    if (action === 'update' || action === 'edit') return crud.u;
    if (action === 'delete' || action === 'remove') return crud.d;
    return null;
}

async function syncCrudPermissionsForRoles(
    db: any,
    roleIds: string[],
    matrix: Record<string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>>,
    matrixRules: Array<{ id: string; permissions: string[] | null }>,
): Promise<void> {
    if (roleIds.length === 0) return;

    const roleRows = await db.query.roles.findMany({
        where: inArray(roles.id, roleIds),
        columns: { id: true, permissions: true },
    });

    for (const role of roleRows) {
        const next = new Set<string>((role.permissions as string[] | null) || []);
        const controlled = new Set<string>();

        for (const rule of matrixRules) {
            const crud = matrix[role.id]?.[rule.id];
            if (!crud) continue;
            for (const permission of rule.permissions || []) {
                const allowed = crudPermissionFlag(permission, crud);
                if (allowed === null) continue;
                controlled.add(permission);
                next.delete(permission);
                if (allowed) next.add(permission);
            }
        }

        // Keep wildcard and non-CRUD permissions untouched. Only permission
        // keys represented by the Rule catalog are recalculated here.
        if (controlled.size > 0) {
            await db.update(roles)
                .set({ permissions: [...next], updatedAt: new Date() })
                .where(eq(roles.id, role.id));
        }
    }
}

/**
 * GET /admin/menu-permissions - Get menu structure for role assignment
 */
adminRoutes.get('/menu-permissions', authenticate, withTenantTx(), requireSuperAdmin(), authorize('admin:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // Try to get from database first
        const dbMenus = await db.query.menuPermissions.findMany({
            where: and(eq(menuPermissions.isActive, true), isNull(menuPermissions.parentId)),
            orderBy: asc(menuPermissions.order),
            with: { children: { with: { children: true } } },
        });

        if (dbMenus.length > 0) {
            return res.json({ success: true, data: dbMenus });
        }

        // Return default structure if none in database
        res.json({ success: true, data: DEFAULT_MENU_STRUCTURE });
    } catch (error) {
        // If table doesn't exist, return defaults
        res.json({ success: true, data: DEFAULT_MENU_STRUCTURE });
    }
});

/**
 * POST /admin/menu-permissions/seed - Seed menu permissions to database
 */
adminRoutes.post('/menu-permissions/seed', authenticate, withTenantTx(), requireSuperAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        await db.delete(menuPermissions);

        for (let i = 0; i < DEFAULT_MENU_STRUCTURE.length; i++) {
            const menu = DEFAULT_MENU_STRUCTURE[i];
            const [parent] = await (db.insert(menuPermissions) as any).values({
                key: menu.key, label: menu.label, labelLao: menu.labelLao, icon: menu.icon,
                path: (menu as any).path || null, requiredPermission: menu.requiredPermission || null,
                order: i, isActive: true,
            }).returning();

            if (menu.children && menu.children.length > 0) {
                for (let j = 0; j < menu.children.length; j++) {
                    const child = menu.children[j];
                    await (db.insert(menuPermissions) as any).values({
                        key: child.key, label: child.label, labelLao: child.labelLao, icon: child.icon,
                        path: child.path, requiredPermission: child.requiredPermission || null,
                        parentId: parent.id, order: j, isActive: true,
                    });
                }
            }
        }

        res.json({ success: true, message: 'Menu permissions seeded successfully' });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/rules/seed - Seed default rules + role-rule CRUD mappings
 */
adminRoutes.post('/rules/seed', authenticate, withTenantTx(), requireSuperAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        await db.delete(roleRules);
        await db.delete(rules);

        const ruleMap: Record<string, string> = {};
        for (const ruleDef of ACCESS_DEFAULT_RULES) {
            const [rule] = await db.insert(rules).values({
                name: ruleDef.name, displayName: ruleDef.displayName, description: ruleDef.description || null,
                module: ruleDef.module, icon: ruleDef.icon || null, routes: ruleDef.routes,
                permissions: ruleDef.permissions, order: ruleDef.order, isSystem: ruleDef.isSystem, isActive: true,
            }).returning();
            ruleMap[ruleDef.name] = rule.id;
        }

        const allRoles = await db.query.roles.findMany();
        const roleMap: Record<string, string> = {};
        for (const role of allRoles) { roleMap[role.name] = role.id; }

        let roleRuleCount = 0;
        for (const [roleName, ruleEntries] of Object.entries(ACCESS_DEFAULT_ROLE_RULES)) {
            const roleId = roleMap[roleName];
            if (!roleId) continue;
            for (const [ruleName, crud] of Object.entries(ruleEntries)) {
                const ruleId = ruleMap[ruleName];
                if (!ruleId) continue;
                await db.insert(roleRules).values({ roleId, ruleId, canRead: crud.r, canCreate: crud.c, canUpdate: crud.u, canDelete: crud.d });
                roleRuleCount++;
            }
        }

        await logActivity(req.authUser!.userId, 'rules_seeded', `ສ້າງ ${Object.keys(ruleMap).length} rules, ${roleRuleCount} role-rules`, {}, req);

        // Invalidate all cached role rules so middleware picks up new mappings
        await invalidateRoleRulesCache();
        await invalidateAllUserStoreCache();

        res.json({
            success: true,
            message: `Seeded ${Object.keys(ruleMap).length} rules, ${roleRuleCount} role-rule mappings`,
            data: { rules: Object.keys(ruleMap).length, roleRules: roleRuleCount }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/rules - Get all rules
 */
adminRoutes.get('/rules', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const allRules = await db.query.rules.findMany({
            where: eq(rules.isActive, true),
            orderBy: asc(rules.order),
            with: { roleRules: { with: { role: { columns: { id: true, name: true, displayName: true } } } } },
        });
        res.json({ success: true, data: allRules });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/roles/:id/rules - Get rules for a specific role with CRUD flags
 */
adminRoutes.get('/roles/:id/rules', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const rrList = await db.query.roleRules.findMany({
            where: eq(roleRules.roleId, req.params.id),
            with: { rule: true },
        });
        res.json({ success: true, data: rrList });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/roles/:id/rules - Update rules for a specific role
 * Body: { rules: [{ ruleId, canRead, canCreate, canUpdate, canDelete }] }
 */
adminRoutes.put('/roles/:id/rules', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id: roleId } = req.params;
        const { rules } = req.body;

        if (!Array.isArray(rules)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'rules must be an array' } });
        }

        // Ownership check (mirrors PATCH /admin/roles/:id) — requireTenantAdmin()
        // only gates on roleLevel <= 5, so without this a branch admin in ANY
        // tenant could pass any roleId, including one belonging to a
        // different tenant, and overwrite its CRUD rules.
        const callerLevel = req.authUser?.roleLevel ?? 7;
        const ruleTargetConds: any[] = [eq(roles.id, roleId)];
        if (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) {
            ruleTargetConds.push(eq(roles.tenantId, req.authUser.tenantId));
        }
        if (!req.authUser?.isSuperAdmin && callerLevel >= 4) {
            ruleTargetConds.push(eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__'));
        }
        const targetRole = await db.query.roles.findFirst({ where: and(...ruleTargetConds) });
        if (!targetRole) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Role not found' } });
        }
        if (targetRole.isSystem) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify system role rules' } });
        }

        await db.delete(roleRules).where(eq(roleRules.roleId, roleId));

        const created: any[] = [];
        for (const rr of rules) {
            if (!rr.ruleId) continue;
            const [entry] = await db.insert(roleRules).values({
                roleId, ruleId: rr.ruleId,
                canRead: rr.canRead ?? true, canCreate: rr.canCreate ?? false,
                canUpdate: rr.canUpdate ?? false, canDelete: rr.canDelete ?? false,
            }).returning();
            created.push(entry);
        }

        const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId), columns: { name: true } });
        await logActivity(req.authUser!.userId, 'role_rules_updated', `ອັບເດດ rules ສຳລັບ ${role?.name}: ${created.length} rules`, { roleId }, req);

        // Invalidate cached rules for this role, AND every already-logged-in
        // holder's cached auth/menu data — kpos:auth:{userId} is what
        // /users/me/menu actually reads, and role_rules is its *primary*
        // source (permissions array is only the fallback), so this is the
        // main path users hit when an admin grants/revokes menu access.
        // Without this, a newly-granted permission (e.g. sales:create for
        // POS) silently doesn't show up for an already-logged-in user until
        // their session naturally expires.
        await invalidateRoleRulesCache(roleId);
        const affectedUsers = await db.query.users.findMany({
            where: eq(users.roleId, roleId),
            columns: { id: true },
        });
        await Promise.all(affectedUsers.map(u => invalidateUserStoreCache(u.id).catch(() => {})));

        res.json({ success: true, data: created, message: `${created.length} rules assigned` });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /admin/rules/matrix - Get the full CRUD matrix in one call
 * Returns: { roles, rules, matrix: { [roleId]: { [ruleId]: { r, c, u, d } } } }
 */
adminRoutes.get('/rules/matrix', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:view'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;

        // Scope to the caller's own visible roles — requireTenantAdmin() only
        // gates on roleLevel <= 5, so without this every tenant's roles (and
        // role_rules) were readable/writable by any branch admin in any tenant.
        const isSuperAdmin = req.authUser?.isSuperAdmin ?? false;
        const callerTenantId = req.authUser?.tenantId;
        const callerLevel = req.authUser?.roleLevel ?? 7;
        const callerBranchId = req.authUser?.activeBranchId;
        const roleScopeConds: any[] = [];
        if (!isSuperAdmin && callerTenantId) roleScopeConds.push(eq(roles.tenantId, callerTenantId));
        if (!isSuperAdmin && callerLevel >= 4) roleScopeConds.push(or(isNull(roles.branchId), eq(roles.branchId, callerBranchId ?? '__none__')));

        const [matrixRules, matrixRoles, dbMenus] = await Promise.all([
            db.query.rules.findMany({ where: eq(rules.isActive, true), orderBy: asc(rules.order) }),
            db.query.roles.findMany({ where: roleScopeConds.length > 0 ? and(...roleScopeConds) : undefined, orderBy: asc(roles.name) }),
            db.query.menuPermissions.findMany({
                where: and(eq(menuPermissions.isActive, true), isNull(menuPermissions.parentId)),
                orderBy: asc(menuPermissions.order),
                with: { children: { with: { children: true } } },
            }),
        ]);
        const matrixRoleIds = matrixRoles.map(r => r.id);
        const matrixRoleRules = matrixRoleIds.length > 0
            ? await db.query.roleRules.findMany({ where: inArray(roleRules.roleId, matrixRoleIds) })
            : [];

        const matrix: Record<string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>> = {};
        for (const role of matrixRoles) {
            matrix[role.id] = {};
            for (const rule of matrixRules) {
                matrix[role.id][rule.id] = { r: false, c: false, u: false, d: false };
            }
        }
        for (const rr of matrixRoleRules) {
            if (matrix[rr.roleId]?.[rr.ruleId]) {
                matrix[rr.roleId][rr.ruleId] = { r: rr.canRead, c: rr.canCreate, u: rr.canUpdate, d: rr.canDelete };
            }
        }

        const roleStats: Record<string, { total: number; read: number; create: number; update: number; delete: number }> = {};
        for (const role of matrixRoles) {
            const stats = { total: matrixRules.length, read: 0, create: 0, update: 0, delete: 0 };
            for (const rule of matrixRules) {
                const crud = matrix[role.id]?.[rule.id];
                if (crud?.r) stats.read++;
                if (crud?.c) stats.create++;
                if (crud?.u) stats.update++;
                if (crud?.d) stats.delete++;
            }
            roleStats[role.id] = stats;
        }

        res.json({
            success: true,
            data: {
                roles: matrixRoles.map(r => ({ id: r.id, name: r.name, displayName: r.displayName, description: r.description, isSystem: r.isSystem, permissions: r.permissions || [] })),
                rules: matrixRules.map(r => ({ id: r.id, name: r.name, displayName: r.displayName, module: r.module, icon: r.icon, routes: r.routes, permissions: r.permissions, order: r.order })),
                matrix,
                roleStats,
                menus: dbMenus.length > 0 ? dbMenus : DEFAULT_MENU_STRUCTURE,
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /admin/rules/matrix - Batch save the entire CRUD matrix in one call
 * Body: { matrix: { [roleId]: { [ruleId]: { r, c, u, d } } } }
 */
adminRoutes.put('/rules/matrix', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { matrix } = req.body;
        if (!matrix || typeof matrix !== 'object') {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'matrix is required' } });
        }

        const isSuperAdmin = req.authUser?.isSuperAdmin ?? false;
        const requestedRoleIds = Object.keys(matrix);

        // Non-superadmin callers may only write role_rules for roles actually
        // visible to them (their own tenant, and their own branch if
        // branch-level) — previously requireTenantAdmin()'s roleLevel<=5 gate
        // was the ONLY check here: this wiped role_rules for EVERY role on
        // the platform and rebuilt from the request body, then cascaded
        // global role rules onto every tenant's same-named roles. A branch
        // admin in Tenant A could rewrite Tenant B's (and every tenant's)
        // permissions through this endpoint.
        let entries: { roleId: string; ruleId: string; canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean }[] = [];
        for (const [roleId, ruleMap] of Object.entries(matrix) as [string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>][]) {
            for (const [ruleId, crud] of Object.entries(ruleMap)) {
                if (crud.r || crud.c || crud.u || crud.d) {
                    entries.push({ roleId, ruleId, canRead: crud.r, canCreate: crud.c, canUpdate: crud.u, canDelete: crud.d });
                }
            }
        }

        let count = 0;

        if (isSuperAdmin) {
            await db.delete(roleRules);
            for (const entry of entries) {
                await db.insert(roleRules).values(entry);
                count++;
            }

            // Propagate global role rules (tenantId=null) to all tenant roles with the same name.
            // Superadmin-only: this is the platform-template cascade, not something
            // a tenant/branch admin's matrix edit should ever trigger.
            const globalRolesList = await db.query.roles.findMany({ where: isNull(roles.tenantId) });
            const globalRulesByRoleId: Record<string, typeof entries> = {};
            for (const gr of globalRolesList) {
                globalRulesByRoleId[gr.id] = entries.filter(e => e.roleId === gr.id);
            }
            for (const gr of globalRolesList) {
                const globalEntries = globalRulesByRoleId[gr.id];
                if (!globalEntries || globalEntries.length === 0) continue;
                const tenantRoles = await db.query.roles.findMany({
                    where: and(eq(roles.name, gr.name), isNotNull(roles.tenantId)),
                });
                for (const tr of tenantRoles) {
                    if (matrix[tr.id]) continue; // already explicitly managed in this payload
                    for (const ge of globalEntries) {
                        await db.insert(roleRules).values({ ...ge, roleId: tr.id });
                        count++;
                    }
                }
            }
        } else {
            const callerTenantId = req.authUser?.tenantId;
            const callerLevel = req.authUser?.roleLevel ?? 7;
            const callerBranchId = req.authUser?.activeBranchId;
            const roleScopeConds: any[] = [];
            if (callerTenantId) roleScopeConds.push(eq(roles.tenantId, callerTenantId));
            // Write scope, not view scope — a branch-level caller (>= 4, same
            // cutoff as create/update/delete elsewhere in this file) may only
            // write role_rules for roles owned by their own branch, not
            // rewrite a tenant-wide template's rules through this batch path.
            if (callerLevel >= 4) roleScopeConds.push(or(isNull(roles.branchId), eq(roles.branchId, callerBranchId ?? '__none__')));

            const visibleRoles = await db.query.roles.findMany({
                where: roleScopeConds.length > 0 ? and(...roleScopeConds) : undefined,
                columns: { id: true, isSystem: true },
            });
            const visibleRoleIds = new Set(visibleRoles.map(r => r.id));
            const invalidIds = requestedRoleIds.filter(id => !visibleRoleIds.has(id));
            if (invalidIds.length > 0) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'One or more roles are outside your tenant/branch scope' } });
            }
            const systemRoleIds = new Set(visibleRoles.filter(r => r.isSystem).map(r => r.id));
            if (requestedRoleIds.some(id => systemRoleIds.has(id))) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify system role rules' } });
            }

            if (requestedRoleIds.length > 0) {
                await db.delete(roleRules).where(inArray(roleRules.roleId, requestedRoleIds));
            }
            for (const entry of entries) {
                await db.insert(roleRules).values(entry);
                count++;
            }
            // No global-role cascade here — a tenant/branch admin's edit only
            // ever affects the roles they were explicitly granted in this call.
        }

        const syncRules = await db.query.rules.findMany({
            where: eq(rules.isActive, true),
            columns: { id: true, permissions: true },
        });
        await syncCrudPermissionsForRoles(db, requestedRoleIds, matrix, syncRules);

        await logActivity(req.authUser!.userId, 'rules_matrix_saved', `ບັນທຶກ CRUD matrix: ${count} role-rules`, {}, req);

        // Invalidate all cached role rules, AND every already-logged-in
        // user's cached auth/menu data (kpos:auth:{userId}) — role_rules is
        // /users/me/menu's primary data source, so without this a grant made
        // here silently doesn't show up until the affected sessions expire.
        // Superadmin writes touch the whole platform's role_rules (full
        // delete + rebuild + cross-tenant cascade above), so bust every
        // user's cache rather than trying to track the exact affected set;
        // tenant/branch admin writes are scoped to requestedRoleIds.
        await invalidateRoleRulesCache();
        if (isSuperAdmin) {
            await invalidateAllUserStoreCache();
        } else if (requestedRoleIds.length > 0) {
            const affectedUsers = await db.query.users.findMany({
                where: inArray(users.roleId, requestedRoleIds),
                columns: { id: true },
            });
            await Promise.all(affectedUsers.map(u => invalidateUserStoreCache(u.id).catch(() => {})));
        }

        res.json({ success: true, message: `ບັນທຶກ ${count} role-rules ສຳເລັດ`, data: { count } });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/roles/:id/copy-rules - Copy rules from one role to another
 * Body: { sourceRoleId: string }
 */
adminRoutes.post('/roles/:id/copy-rules', authenticate, withTenantTx(), requireSuperAdmin(), authorize('roles:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const targetRoleId = req.params.id;
        const { sourceRoleId } = req.body;

        if (!sourceRoleId) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'sourceRoleId is required' } });
        }

        // Ownership check — without this, a caller could copy rules FROM a role
        // in another tenant (reconnaissance) or INTO a role in another tenant
        // (overwrite), same bug class as PUT /roles/:id/rules above.
        const copyCallerLevel = req.authUser?.roleLevel ?? 7;
        const roleVisibleConds = (roleId: string) => {
            const conds: any[] = [eq(roles.id, roleId)];
            if (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) conds.push(eq(roles.tenantId, req.authUser.tenantId));
            if (!req.authUser?.isSuperAdmin && copyCallerLevel >= 5) conds.push(eq(roles.branchId, req.authUser?.activeBranchId ?? '__none__'));
            return and(...conds);
        };
        const [sourceRoleCheck, targetRoleCheck] = await Promise.all([
            db.query.roles.findFirst({ where: roleVisibleConds(sourceRoleId) }),
            db.query.roles.findFirst({ where: roleVisibleConds(targetRoleId) }),
        ]);
        if (!sourceRoleCheck || !targetRoleCheck) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Source or target role not found' } });
        }
        if (targetRoleCheck.isSystem) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify system role rules' } });
        }

        const sourceRulesList = await db.query.roleRules.findMany({ where: eq(roleRules.roleId, sourceRoleId) });
        await db.delete(roleRules).where(eq(roleRules.roleId, targetRoleId));

        let count = 0;
        for (const sr of sourceRulesList) {
            await db.insert(roleRules).values({
                roleId: targetRoleId, ruleId: sr.ruleId,
                canRead: sr.canRead, canCreate: sr.canCreate, canUpdate: sr.canUpdate, canDelete: sr.canDelete,
            });
            count++;
        }

        const copiedMatrix: Record<string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>> = { [targetRoleId]: {} };
        for (const sr of sourceRulesList) {
            copiedMatrix[targetRoleId][sr.ruleId] = { r: sr.canRead, c: sr.canCreate, u: sr.canUpdate, d: sr.canDelete };
        }
        const copyRulesCatalog = await db.query.rules.findMany({
            where: eq(rules.isActive, true),
            columns: { id: true, permissions: true },
        });
        await syncCrudPermissionsForRoles(db, [targetRoleId], copiedMatrix, copyRulesCatalog);

        const [sourceRole, targetRole] = await Promise.all([
            db.query.roles.findFirst({ where: eq(roles.id, sourceRoleId), columns: { name: true } }),
            db.query.roles.findFirst({ where: eq(roles.id, targetRoleId), columns: { name: true } }),
        ]);
        await logActivity(req.authUser!.userId, 'role_rules_copied', `ຄັດລອກ rules ຈາກ ${sourceRole?.name} → ${targetRole?.name}: ${count} rules`, { sourceRoleId, targetRoleId }, req);

        // Invalidate cached rules for the target role
        await invalidateRoleRulesCache(targetRoleId);
        const targetUsers = await db.query.users.findMany({ where: eq(users.roleId, targetRoleId), columns: { id: true } });
        await Promise.all(targetUsers.map(u => invalidateUserStoreCache(u.id).catch(() => {})));

        res.json({ success: true, message: `ຄັດລອກ ${count} rules ສຳເລັດ`, data: { count } });
    } catch (error) {
        next(error);
    }
});

/**
 * PATCH /stores/:id/status - Toggle store status
 */
adminRoutes.patch('/stores/:id/status', authenticate, withTenantTx(), authorize('stores:update', 'admin:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { id } = req.params;
        const { isActive } = req.body;

        // Was a hardcoded role==='admin' name check with NO tenant scope on
        // the update query itself — authorize() above already gates on
        // stores:update/admin:manage, but this then either wrongly blocked
        // legitimate tenant admins whose role name isn't literally "admin"
        // (hq_admin, merchant_owner, tenant_admin, ...), or — worse — let
        // anyone holding the literal role name "admin" toggle ANY store in
        // ANY tenant by ID, since neither branch checked store ownership.
        const storeConds: any[] = [eq(stores.id, id)];
        if (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) {
            storeConds.push(eq(stores.tenantId, req.authUser.tenantId));
        }
        const existingStore = await db.query.stores.findFirst({ where: and(...storeConds) });
        if (!existingStore) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Store not found or no access' }
            });
        }

        const [store] = await (db.update(stores) as any).set({ isActive: Boolean(isActive) }).where(eq(stores.id, id)).returning();

        res.json({ success: true, data: store });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /admin/reset-database - Reset database (Super Admin only)
 * ລົບຂໍ້ມູນທັງໝົດແຕ່ຈົ່ງໄວ້ Super Admin users ແລະ roles
 */
adminRoutes.post('/reset-database', authenticate, withTenantTx(), requireSuperAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const superAdmins = await db.query.users.findMany({
            where: eq(users.isSuperAdmin, true),
            columns: { id: true, email: true, name: true },
        });
        const superAdminIds = superAdmins.map(u => u.id);
        
        const [{ value: rolesCount }] = await db.select({ value: count() }).from(roles);
        
        // Delete all data in order (child tables first)
        // 1. Transaction related
        await db.delete(transactionPayments);
        await db.delete(transactionItems);
        await db.delete(transactions);
        await db.delete(heldSales);
        
        // 2. Order related
        await db.delete(orderItems);
        await db.delete(orders);
        await db.delete(reservations);
        await db.delete(tables);
        
        // 3. Shift related
        await db.delete(cashMovements);
        await db.delete(shifts);
        await db.delete(cashRegisters);
        
        // 4. Inventory related
        await db.delete(stockTransferItems);
        await db.delete(stockTransfers);
        await db.delete(stockMovements);
        await db.delete(stockCounts);
        await db.delete(inventory);
        
        // 5. Purchase Order related
        await db.delete(purchaseOrderItems);
        await db.delete(purchaseOrders);
        await db.delete(vendors);
        
        // 6. Product related
        await db.delete(billOfMaterials);
        await db.delete(productPriceLevels);
        await db.delete(skuVariants);
        await db.delete(productStores);
        await db.delete(products);
        await db.delete(categories);
        await db.delete(priceLevels);
        
        // 7. Customer related
        await db.delete(pointsHistory);
        await db.delete(customers);
        
        // 8. Member related
        await db.delete(pointHistory);
        await db.delete(members);
        await db.delete(membershipTiers);
        await db.delete(pointSettings);
        
        // 9. Promotion related
        await db.delete(promotions);
        await db.delete(coupons);
        
        // 10. User related (except Super Admins)
        await db.delete(sessions);
        await db.delete(activityLogs);
        await db.delete(storeRequests);
        await db.delete(userStores);
        if (superAdminIds.length > 0) {
            await db.delete(users).where(notInArray(users.id, superAdminIds));
        } else {
            await db.delete(users);
        }
        
        // 11. Store related
        await db.delete(stores);
        
        // 12. Branch related
        await db.delete(branches);
        
        // 13. Payment methods
        await db.delete(paymentMethods);
        
        // 14. Permissions
        await db.delete(permissions);
        await db.delete(permissionGroups);
        await db.delete(menuPermissions);
        
        // Create default branch for Super Admins
        const resetTenantId = req.authUser?.tenantId || req.user?.tenantId;
        const [defaultBranch] = await (db.insert(branches) as any).values({
            tenantId: resetTenantId,
            name: 'ສຳນັກງານໃຫຍ່', code: 'HQ', isMain: true,
        }).returning();
        
        // Update Super Admin users with new branch
        if (superAdminIds.length > 0) {
            await (db.update(users) as any).set({ branchId: defaultBranch.id }).where(inArray(users.id, superAdminIds));
        }
        
        res.json({
            success: true,
            data: {
                message: 'Database reset completed',
                preserved: {
                    superAdmins: superAdmins.length,
                    roles: rolesCount
                },
                created: {
                    defaultBranch: defaultBranch.name
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE BACKUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/backup
 * Export all tables as a JSON backup file (super admin only).
 */
adminRoutes.post('/backup', authenticate, withTenantTx(), requireSuperAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        const [
            branchRows, userRows, sessionRows, roleRows, ruleRows, roleRuleRows,
            permGroupRows, permRows, menuPermRows, storeRows, userStoreRows, productStoreRows,
            storeRequestRows, categoryRows, productRows, skuVariantRows, bomRows,
            priceLevelRows, productPriceLevelRows, inventoryRows, stockMovementRows,
            customerRows, pointsHistoryRows, transactionRows, transactionItemRows,
            transactionPaymentRows, heldSaleRows, paymentMethodRows, shiftRows,
            cashRegisterRows, cashMovementRows, tableRows, orderRows, orderItemRows,
            reservationRows, memberRows, membershipTierRows, pointHistoryRows,
            pointSettingsRows, promotionRows, couponRows, discountRows, settlementRows,
            vendorRows, purchaseOrderRows, purchaseOrderItemRows, stockTransferRows,
            stockTransferItemRows, stockCountRows, stockCountItemRows, documentRows,
            documentTemplateRows, settingRows, notificationRows, activityLogRows,
        ] = await Promise.all([
            db.select().from(branches),
            db.select({ id: users.id, email: users.email, name: users.name, role: users.role,
                roleId: users.roleId, branchId: users.branchId, isActive: users.isActive,
                isSuperAdmin: users.isSuperAdmin, createdAt: users.createdAt }).from(users),
            db.select().from(sessions),
            db.select().from(roles),
            db.select().from(rules),
            db.select().from(roleRules),
            db.select().from(permissionGroups),
            db.select().from(permissions),
            db.select().from(menuPermissions),
            db.select().from(stores),
            db.select().from(userStores),
            db.select().from(productStores),
            db.select().from(storeRequests),
            db.select().from(categories),
            db.select().from(products),
            db.select().from(skuVariants),
            db.select().from(billOfMaterials),
            db.select().from(priceLevels),
            db.select().from(productPriceLevels),
            db.select().from(inventory),
            db.select().from(stockMovements),
            db.select().from(customers),
            db.select().from(pointsHistory),
            db.select().from(transactions),
            db.select().from(transactionItems),
            db.select().from(transactionPayments),
            db.select().from(heldSales),
            db.select().from(paymentMethods),
            db.select().from(shifts),
            db.select().from(cashRegisters),
            db.select().from(cashMovements),
            db.select().from(tables),
            db.select().from(orders),
            db.select().from(orderItems),
            db.select().from(reservations),
            db.select().from(members),
            db.select().from(membershipTiers),
            db.select().from(pointHistory),
            db.select().from(pointSettings),
            db.select().from(promotions),
            db.select().from(coupons),
            db.select().from(discounts),
            db.select().from(settlements),
            db.select().from(vendors),
            db.select().from(purchaseOrders),
            db.select().from(purchaseOrderItems),
            db.select().from(stockTransfers),
            db.select().from(stockTransferItems),
            db.select().from(stockCounts),
            db.select().from(stockCountItems),
            db.select().from(documents),
            db.select().from(documentTemplates),
            db.select().from(settings),
            db.select().from(notifications),
            db.select().from(activityLogs),
        ]);

        const backup = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            tables: {
                branches: branchRows, users: userRows, sessions: sessionRows,
                roles: roleRows, rules: ruleRows, roleRules: roleRuleRows,
                permissionGroups: permGroupRows, permissions: permRows, menuPermissions: menuPermRows,
                stores: storeRows, userStores: userStoreRows, productStores: productStoreRows,
                storeRequests: storeRequestRows, categories: categoryRows, products: productRows,
                skuVariants: skuVariantRows, billOfMaterials: bomRows, priceLevels: priceLevelRows,
                productPriceLevels: productPriceLevelRows, inventory: inventoryRows,
                stockMovements: stockMovementRows, customers: customerRows,
                pointsHistory: pointsHistoryRows, transactions: transactionRows,
                transactionItems: transactionItemRows, transactionPayments: transactionPaymentRows,
                heldSales: heldSaleRows, paymentMethods: paymentMethodRows, shifts: shiftRows,
                cashRegisters: cashRegisterRows, cashMovements: cashMovementRows, tables: tableRows,
                orders: orderRows, orderItems: orderItemRows, reservations: reservationRows,
                members: memberRows, membershipTiers: membershipTierRows,
                pointHistory: pointHistoryRows, pointSettings: pointSettingsRows,
                promotions: promotionRows, coupons: couponRows, discounts: discountRows,
                settlements: settlementRows, vendors: vendorRows, purchaseOrders: purchaseOrderRows,
                purchaseOrderItems: purchaseOrderItemRows, stockTransfers: stockTransferRows,
                stockTransferItems: stockTransferItemRows, stockCounts: stockCountRows,
                stockCountItems: stockCountItemRows, documents: documentRows,
                documentTemplates: documentTemplateRows, settings: settingRows,
                notifications: notificationRows, activityLogs: activityLogRows,
            },
            stats: {
                branches: branchRows.length, users: userRows.length, roles: roleRows.length,
                stores: storeRows.length, products: productRows.length, customers: customerRows.length,
                transactions: transactionRows.length, inventory: inventoryRows.length,
                activityLogs: activityLogRows.length,
            },
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="kpos-backup-${timestamp}.json"`);
        res.json(backup);
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BACKFILL USER STORE RECORDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/backfill-user-stores
 * Creates UserStore records for existing users who have none.
 * Associates each user with the store that belongs to their branch.
 * Safe to run multiple times (upsert).
 */
adminRoutes.post('/backfill-user-stores', authenticate, withTenantTx(), requireAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const usersWithoutStores = await db.query.users.findMany({
            where: and(eq(users.isSuperAdmin, false), ne(users.branchId, '')),
            columns: { id: true, branchId: true, name: true, email: true },
        });

        let created = 0;
        let skipped = 0;

        for (const user of usersWithoutStores) {
            const [{ value: existing }] = await db.select({ value: count() }).from(userStores).where(eq(userStores.userId, user.id));
            if (existing > 0) { skipped++; continue; }

            const owningBranch = await db.query.branches.findFirst({
                where: eq(branches.id, user.branchId!),
                columns: { storeId: true },
            });

            if (!owningBranch) { skipped++; continue; }

            await db.insert(userStores).values({
                userId: user.id, storeId: owningBranch.storeId, branchId: user.branchId!,
                canRead: true, canWrite: true, canDelete: false, canManage: false, isDefault: true,
            });
            created++;
        }

        res.json({
            success: true,
            data: {
                message: 'Backfill complete',
                total: usersWithoutStores.length,
                created,
                skipped,
            },
        });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BITMASK MIGRATION — compute maskLow/maskHigh for all existing roles
// POST /admin/migrate-role-masks  (Super Admin only)
// ═══════════════════════════════════════════════════════════════════════════
adminRoutes.post('/migrate-role-masks', authenticate, withTenantTx(), requireSuperAdmin(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const allRoles = await db.query.roles.findMany({
            columns: { id: true, permissions: true, maskLow: true, maskHigh: true },
        });

        let updated = 0;
        let skipped = 0;

        for (const role of allRoles) {
            const perms = (role.permissions as string[]) || [];
            const mask  = permissionsToMask(perms);

            // Skip if already correct (compare as BigInt)
            if (BigInt(role.maskLow ?? 0) === mask.low && BigInt(role.maskHigh ?? 0) === mask.high) {
                skipped++;
                continue;
            }

            await db.update(roles)
                .set({ maskLow: mask.low, maskHigh: mask.high, updatedAt: new Date() })
                .where(eq(roles.id, role.id));

            updated++;
        }

        res.json({
            success: true,
            data: {
                message: 'Bitmask migration complete',
                total: allRoles.length,
                updated,
                skipped,
            },
        });
    } catch (error) {
        next(error);
    }
});
