// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Auth & Users Schema (Drizzle + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { branches } from './branch';

// ─── Users ───────────────────────────────────────────────────────────────

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    avatar: text('avatar'),
    role: text('role').notNull().default('staff'),
    roleId: uuid('role_id'),
    branchId: uuid('branch_id').references(() => branches.id),
    permissions: text('permissions').array().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    emailVerified: boolean('email_verified').notNull().default(false),
    twoFAEnabled: boolean('two_fa_enabled').notNull().default(false),
    twoFASecret: text('two_fa_secret'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const usersRelations = relations(users, ({ one, many }) => ({
    branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
    roleRelation: one(roles, { fields: [users.roleId], references: [roles.id] }),
    transactions: many(transactions),
    shifts: many(shifts),
    activityLogs: many(activityLogs),
    sessions: many(sessions),
    accessibleStores: many(userStores),
    storeRequests: many(storeRequests, { relationName: 'requestedBy' }),
    reviewedRequests: many(storeRequests, { relationName: 'reviewedBy' }),
}));

// ─── Sessions ────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    refreshToken: text('refresh_token').notNull().unique(),
    device: text('device'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// ─── Roles ───────────────────────────────────────────────────────────────

export const roles = pgTable('roles', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    permissions: text('permissions').array().notNull().default([]),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const rolesRelations = relations(roles, ({ many }) => ({
    users: many(users),
    roleRules: many(roleRules),
}));

// ─── Rules & Role Rules ─────────────────────────────────────────────────

export const rules = pgTable('rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    module: text('module').notNull(),
    icon: text('icon'),
    routes: text('routes').array().notNull().default([]),
    permissions: text('permissions').array().notNull().default([]),
    order: uuid('order').notNull().default(0 as any),
    isActive: boolean('is_active').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const rulesRelations = relations(rules, ({ many }) => ({
    roleRules: many(roleRules),
}));

export const roleRules = pgTable('role_rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id').notNull().references(() => rules.id, { onDelete: 'cascade' }),
    canRead: boolean('can_read').notNull().default(true),
    canCreate: boolean('can_create').notNull().default(false),
    canUpdate: boolean('can_update').notNull().default(false),
    canDelete: boolean('can_delete').notNull().default(false),
}, (t) => [
    uniqueIndex('role_rules_role_rule_idx').on(t.roleId, t.ruleId),
]);

export const roleRulesRelations = relations(roleRules, ({ one }) => ({
    role: one(roles, { fields: [roleRules.roleId], references: [roles.id] }),
    rule: one(rules, { fields: [roleRules.ruleId], references: [rules.id] }),
}));

// ─── Permissions ─────────────────────────────────────────────────────────

export const permissionGroups = pgTable('permission_groups', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    icon: text('icon'),
    color: text('color'),
    order: uuid('order').notNull().default(0 as any),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const permissionGroupsRelations = relations(permissionGroups, ({ many }) => ({
    permissions: many(permissions),
}));

export const permissions = pgTable('permissions', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    groupId: uuid('group_id').notNull().references(() => permissionGroups.id, { onDelete: 'cascade' }),
    order: uuid('order').notNull().default(0 as any),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const permissionsRelations = relations(permissions, ({ one }) => ({
    group: one(permissionGroups, { fields: [permissions.groupId], references: [permissionGroups.id] }),
}));

// ─── Menu Permissions ────────────────────────────────────────────────────

export const menuPermissions = pgTable('menu_permissions', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    labelLao: text('label_lao'),
    icon: text('icon'),
    path: text('path'),
    parentId: uuid('parent_id'),
    requiredPermission: text('required_permission'),
    order: uuid('order').notNull().default(0 as any),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('menu_permissions_parent_idx').on(t.parentId),
]);

export const menuPermissionsRelations = relations(menuPermissions, ({ one, many }) => ({
    parent: one(menuPermissions, { fields: [menuPermissions.parentId], references: [menuPermissions.id], relationName: 'menuHierarchy' }),
    children: many(menuPermissions, { relationName: 'menuHierarchy' }),
}));

// ─── Store Requests ──────────────────────────────────────────────────────

export const storeRequests = pgTable('store_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: uuid('requester_id').notNull().references(() => users.id),
    branchId: uuid('branch_id').references(() => branches.id),
    type: text('type').notNull(),
    storeName: text('store_name'),
    storeCode: text('store_code'),
    storeAddress: text('store_address'),
    storePhone: text('store_phone'),
    storeEmail: text('store_email'),
    branchName: text('branch_name'),
    branchCode: text('branch_code'),
    branchAddress: text('branch_address'),
    branchPhone: text('branch_phone'),
    branchEmail: text('branch_email'),
    reason: text('reason'),
    documents: text('documents').array().notNull().default([]),
    metadata: text('metadata').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('pending'),
    priority: text('priority').notNull().default('normal'),
    reviewerId: uuid('reviewer_id'),
    reviewNote: text('review_note'),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
    expiresAt: timestamp('expires_at'),
}, (t) => [
    index('store_requests_status_created_idx').on(t.status, t.createdAt),
    index('store_requests_requester_idx').on(t.requesterId),
]);

export const storeRequestsRelations = relations(storeRequests, ({ one }) => ({
    requester: one(users, { fields: [storeRequests.requesterId], references: [users.id], relationName: 'requestedBy' }),
    reviewer: one(users, { fields: [storeRequests.reviewerId], references: [users.id], relationName: 'reviewedBy' }),
    branch: one(branches, { fields: [storeRequests.branchId], references: [branches.id] }),
}));

// ─── Activity Logs ───────────────────────────────────────────────────────

export const activityLogs = pgTable('activity_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    action: text('action').notNull(),
    description: text('description'),
    entity: text('entity'),
    entityId: uuid('entity_id'),
    metadata: text('metadata').$type<Record<string, unknown>>(),
    oldData: text('old_data').$type<Record<string, unknown>>(),
    newData: text('new_data').$type<Record<string, unknown>>(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
    index('activity_logs_user_idx').on(t.userId),
    index('activity_logs_action_idx').on(t.action),
    index('activity_logs_created_idx').on(t.createdAt),
]);

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
    user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}));

// ─── Notifications ───────────────────────────────────────────────────────

export const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    data: text('data').$type<Record<string, unknown>>(),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Forward references (imported from other schema files)
import { transactions } from './sales';
import { shifts } from './shift';
import { userStores } from './store';
