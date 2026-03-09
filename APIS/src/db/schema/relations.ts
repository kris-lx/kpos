// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Drizzle Relations (PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import { relations } from 'drizzle-orm';
import {
    tenants, branches, users, sessions, roles, rules, roleRules,
    permissionGroups, permissions, menuPermissions, stores, userStores, productStores,
    storeRequests, categories, products, skuVariants, billOfMaterials, priceLevels,
    productPriceLevels, inventory, stockMovements, customers, pointsHistory,
    transactions, transactionItems, transactionPayments, heldSales, paymentMethods,
    shifts, cashRegisters, cashMovements, tables, orders, orderItems,
    members, membershipTiers, pointHistory, documents, activityLogs, settings,
    vendors, purchaseOrders, purchaseOrderItems, stockTransfers, stockTransferItems,
    stockCounts, stockCountItems, promotions, coupons, discounts, notifications,
    settlements, platformAuditLogs, userRoleAssignments,
} from './tables';

// ─── Tenant Relations ────────────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ many }) => ({
    branches: many(branches),
    users: many(users),
    stores: many(stores),
    products: many(products),
    roles: many(roles),
}));

// ─── Branch Relations ────────────────────────────────────────────────────

export const branchesRelations = relations(branches, ({ one, many }) => ({
    tenant: one(tenants, { fields: [branches.tenantId], references: [tenants.id] }),
    users: many(users),
    products: many(products),
    transactions: many(transactions),
    inventory: many(inventory),
    tables: many(tables),
    orders: many(orders),
    shifts: many(shifts),
    cashRegisters: many(cashRegisters),
    customers: many(customers),
    stores: many(stores),
    userStores: many(userStores),
    storeRequests: many(storeRequests),
    documents: many(documents),
}));

// ─── User Relations ──────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
    tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
    branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
    roleRelation: one(roles, { fields: [users.roleId], references: [roles.id] }),
    transactions: many(transactions),
    shifts: many(shifts),
    activityLogs: many(activityLogs),
    sessions: many(sessions),
    accessibleStores: many(userStores),
    roleAssignments: many(userRoleAssignments),
    storeRequests: many(storeRequests, { relationName: 'requestedBy' }),
    reviewedRequests: many(storeRequests, { relationName: 'reviewedBy' }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
    users: many(users),
    roleRules: many(roleRules),
    roleAssignments: many(userRoleAssignments),
}));

export const rulesRelations = relations(rules, ({ many }) => ({
    roleRules: many(roleRules),
}));

export const roleRulesRelations = relations(roleRules, ({ one }) => ({
    role: one(roles, { fields: [roleRules.roleId], references: [roles.id] }),
    rule: one(rules, { fields: [roleRules.ruleId], references: [rules.id] }),
}));

export const permissionGroupsRelations = relations(permissionGroups, ({ many }) => ({
    permissions: many(permissions),
}));

export const permissionsRelations = relations(permissions, ({ one }) => ({
    group: one(permissionGroups, { fields: [permissions.groupId], references: [permissionGroups.id] }),
}));

export const menuPermissionsRelations = relations(menuPermissions, ({ one, many }) => ({
    parent: one(menuPermissions, { fields: [menuPermissions.parentId], references: [menuPermissions.id], relationName: 'menuHierarchy' }),
    children: many(menuPermissions, { relationName: 'menuHierarchy' }),
}));

// ─── Store Relations ─────────────────────────────────────────────────────

export const storesRelations = relations(stores, ({ one, many }) => ({
    tenant: one(tenants, { fields: [stores.tenantId], references: [tenants.id] }),
    branch: one(branches, { fields: [stores.branchId], references: [branches.id] }),
    userAccess: many(userStores),
    products: many(productStores),
    customers: many(customers),
    inventory: many(inventory),
    stockMovements: many(stockMovements),
    transactions: many(transactions),
    promotions: many(promotions),
    coupons: many(coupons),
    discounts: many(discounts),
    heldSales: many(heldSales),
    shifts: many(shifts),
    documents: many(documents),
    categories: many(categories),
}));

export const userStoresRelations = relations(userStores, ({ one }) => ({
    user: one(users, { fields: [userStores.userId], references: [users.id] }),
    store: one(stores, { fields: [userStores.storeId], references: [stores.id] }),
    branch: one(branches, { fields: [userStores.branchId], references: [branches.id] }),
}));

export const productStoresRelations = relations(productStores, ({ one }) => ({
    product: one(products, { fields: [productStores.productId], references: [products.id] }),
    store: one(stores, { fields: [productStores.storeId], references: [stores.id] }),
}));

export const storeRequestsRelations = relations(storeRequests, ({ one }) => ({
    requester: one(users, { fields: [storeRequests.requesterId], references: [users.id], relationName: 'requestedBy' }),
    reviewer: one(users, { fields: [storeRequests.reviewerId], references: [users.id], relationName: 'reviewedBy' }),
    branch: one(branches, { fields: [storeRequests.branchId], references: [branches.id] }),
}));

// ─── Product Relations ───────────────────────────────────────────────────

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    parent: one(categories, { fields: [categories.parentId], references: [categories.id], relationName: 'categoryHierarchy' }),
    children: many(categories, { relationName: 'categoryHierarchy' }),
    products: many(products),
    store: one(stores, { fields: [categories.storeId], references: [stores.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
    tenant: one(tenants, { fields: [products.tenantId], references: [tenants.id] }),
    category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
    vendor: one(vendors, { fields: [products.vendorId], references: [vendors.id] }),
    branch: one(branches, { fields: [products.branchId], references: [branches.id] }),
    inventory: many(inventory),
    transactionItems: many(transactionItems),
    orderItems: many(orderItems),
    skuVariants: many(skuVariants),
    bom: many(billOfMaterials),
    priceLevels: many(productPriceLevels),
    stores: many(productStores),
}));

export const skuVariantsRelations = relations(skuVariants, ({ one, many }) => ({
    product: one(products, { fields: [skuVariants.productId], references: [products.id] }),
    inventory: many(inventory),
}));

export const billOfMaterialsRelations = relations(billOfMaterials, ({ one }) => ({
    product: one(products, { fields: [billOfMaterials.productId], references: [products.id] }),
}));

export const priceLevelsRelations = relations(priceLevels, ({ many }) => ({
    products: many(productPriceLevels),
}));

export const productPriceLevelsRelations = relations(productPriceLevels, ({ one }) => ({
    product: one(products, { fields: [productPriceLevels.productId], references: [products.id] }),
    priceLevel: one(priceLevels, { fields: [productPriceLevels.priceLevelId], references: [priceLevels.id] }),
}));

// ─── Inventory Relations ─────────────────────────────────────────────────

export const inventoryRelations = relations(inventory, ({ one }) => ({
    product: one(products, { fields: [inventory.productId], references: [products.id] }),
    skuVariant: one(skuVariants, { fields: [inventory.skuVariantId], references: [skuVariants.id] }),
    branch: one(branches, { fields: [inventory.branchId], references: [branches.id] }),
    store: one(stores, { fields: [inventory.storeId], references: [stores.id] }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
    store: one(stores, { fields: [stockMovements.storeId], references: [stores.id] }),
}));

// ─── Customer Relations ──────────────────────────────────────────────────

export const customersRelations = relations(customers, ({ one, many }) => ({
    branch: one(branches, { fields: [customers.branchId], references: [branches.id] }),
    store: one(stores, { fields: [customers.storeId], references: [stores.id] }),
    transactions: many(transactions),
    pointsHistory: many(pointsHistory),
}));

export const pointsHistoryRelations = relations(pointsHistory, ({ one }) => ({
    customer: one(customers, { fields: [pointsHistory.customerId], references: [customers.id] }),
}));

// ─── Transaction Relations ───────────────────────────────────────────────

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
    branch: one(branches, { fields: [transactions.branchId], references: [branches.id] }),
    store: one(stores, { fields: [transactions.storeId], references: [stores.id] }),
    user: one(users, { fields: [transactions.userId], references: [users.id] }),
    shift: one(shifts, { fields: [transactions.shiftId], references: [shifts.id] }),
    member: one(members, { fields: [transactions.memberId], references: [members.id] }),
    customer: one(customers, { fields: [transactions.customerId], references: [customers.id] }),
    items: many(transactionItems),
    payments: many(transactionPayments),
}));

export const transactionItemsRelations = relations(transactionItems, ({ one }) => ({
    transaction: one(transactions, { fields: [transactionItems.transactionId], references: [transactions.id] }),
    product: one(products, { fields: [transactionItems.productId], references: [products.id] }),
}));

export const transactionPaymentsRelations = relations(transactionPayments, ({ one }) => ({
    transaction: one(transactions, { fields: [transactionPayments.transactionId], references: [transactions.id] }),
    paymentMethod: one(paymentMethods, { fields: [transactionPayments.methodId], references: [paymentMethods.id] }),
}));

export const paymentMethodsRelations = relations(paymentMethods, ({ many }) => ({
    transactions: many(transactionPayments),
}));

export const heldSalesRelations = relations(heldSales, ({ one }) => ({
    store: one(stores, { fields: [heldSales.storeId], references: [stores.id] }),
}));

// ─── Shift Relations ─────────────────────────────────────────────────────

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
    branch: one(branches, { fields: [shifts.branchId], references: [branches.id] }),
    user: one(users, { fields: [shifts.userId], references: [users.id] }),
    register: one(cashRegisters, { fields: [shifts.registerId], references: [cashRegisters.id] }),
    store: one(stores, { fields: [shifts.storeId], references: [stores.id] }),
    transactions: many(transactions),
    cashMovements: many(cashMovements),
}));

export const cashRegistersRelations = relations(cashRegisters, ({ one, many }) => ({
    branch: one(branches, { fields: [cashRegisters.branchId], references: [branches.id] }),
    store: one(stores, { fields: [cashRegisters.storeId], references: [stores.id] }),
    shifts: many(shifts),
}));

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
    shift: one(shifts, { fields: [cashMovements.shiftId], references: [shifts.id] }),
}));

// ─── Restaurant Relations ────────────────────────────────────────────────

export const tablesRelations = relations(tables, ({ one, many }) => ({
    branch: one(branches, { fields: [tables.branchId], references: [branches.id] }),
    orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
    branch: one(branches, { fields: [orders.branchId], references: [branches.id] }),
    table: one(tables, { fields: [orders.tableId], references: [tables.id] }),
    items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
    order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
    product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

// ─── Member Relations ────────────────────────────────────────────────────

export const membersRelations = relations(members, ({ one, many }) => ({
    tier: one(membershipTiers, { fields: [members.tierId], references: [membershipTiers.id] }),
    transactions: many(transactions),
    pointHistory: many(pointHistory),
}));

export const membershipTiersRelations = relations(membershipTiers, ({ many }) => ({
    members: many(members),
}));

export const pointHistoryRelations = relations(pointHistory, ({ one }) => ({
    member: one(members, { fields: [pointHistory.memberId], references: [members.id] }),
}));

// ─── Vendor Relations ────────────────────────────────────────────────────

export const vendorsRelations = relations(vendors, ({ many }) => ({
    purchaseOrders: many(purchaseOrders),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one, many }) => ({
    vendor: one(vendors, { fields: [purchaseOrders.vendorId], references: [vendors.id] }),
    items: many(purchaseOrderItems),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({ one }) => ({
    purchaseOrder: one(purchaseOrders, { fields: [purchaseOrderItems.purchaseOrderId], references: [purchaseOrders.id] }),
}));

export const stockTransfersRelations = relations(stockTransfers, ({ many }) => ({
    items: many(stockTransferItems),
}));

export const stockTransferItemsRelations = relations(stockTransferItems, ({ one }) => ({
    transfer: one(stockTransfers, { fields: [stockTransferItems.transferId], references: [stockTransfers.id] }),
}));

export const stockCountsRelations = relations(stockCounts, ({ many }) => ({
    items: many(stockCountItems),
}));

export const stockCountItemsRelations = relations(stockCountItems, ({ one }) => ({
    stockCount: one(stockCounts, { fields: [stockCountItems.countId], references: [stockCounts.id] }),
}));

// ─── Promotion Relations ─────────────────────────────────────────────────

export const promotionsRelations = relations(promotions, ({ one }) => ({
    store: one(stores, { fields: [promotions.storeId], references: [stores.id] }),
}));

export const couponsRelations = relations(coupons, ({ one }) => ({
    store: one(stores, { fields: [coupons.storeId], references: [stores.id] }),
}));

export const discountsRelations = relations(discounts, ({ one }) => ({
    store: one(stores, { fields: [discounts.storeId], references: [stores.id] }),
}));

// ─── Settlement Relations ────────────────────────────────────────────────

export const settlementsRelations = relations(settlements, ({ one }) => ({
    branch: one(branches, { fields: [settlements.branchId], references: [branches.id] }),
    store: one(stores, { fields: [settlements.storeId], references: [stores.id] }),
}));

// ─── Settings Relations ─────────────────────────────────────────────────

export const settingsRelations = relations(settings, ({ one }) => ({
    branch: one(branches, { fields: [settings.branchId], references: [branches.id] }),
    store: one(stores, { fields: [settings.storeId], references: [stores.id] }),
}));

// ─── Document Relations ──────────────────────────────────────────────────

export const documentsRelations = relations(documents, ({ one }) => ({
    branch: one(branches, { fields: [documents.branchId], references: [branches.id] }),
    store: one(stores, { fields: [documents.storeId], references: [stores.id] }),
}));

// ─── Activity Log Relations ──────────────────────────────────────────────

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
    user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}));

// ─── Notification Relations ─────────────────────────────────────────────

export const notificationsRelations = relations(notifications, ({ one }) => ({
    user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ─── User Role Assignments Relations ────────────────────────────────────

export const userRoleAssignmentsRelations = relations(userRoleAssignments, ({ one }) => ({
    user: one(users, { fields: [userRoleAssignments.userId], references: [users.id] }),
    role: one(roles, { fields: [userRoleAssignments.roleId], references: [roles.id] }),
    tenant: one(tenants, { fields: [userRoleAssignments.tenantId], references: [tenants.id] }),
    store: one(stores, { fields: [userRoleAssignments.storeId], references: [stores.id] }),
}));
