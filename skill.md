# KPOS — Skill File: Roles & What Each Role Can / Cannot Do
# PURPOSE: Defines WHO can do WHAT in KPOS. This is the authority on role capabilities.
# Agents: read this to assign permission bits and guard routes correctly.
# Last updated: 2026-06-17

---

## ▌ PLATFORM LAYER — No tenantId. Manages the SaaS platform itself.

### platform_super_admin  (level 1)
**CAN:**
- Create, suspend, reactivate, delete any tenant account
- View all tenants, billing status, subscription tier, transaction counts
- Configure platform-level settings (pricing plans, feature flags)
- Access platform billing and subscription management
- Impersonate any tenant user (support tool)
- Write to platformAuditLogs

**CANNOT:**
- Create POS sales (not a cashier)
- Modify any tenant's business data (products, customers, inventory)
- Access /pos, /reports (tenant), /dashboard (tenant)

**Routes:** /admin/* only

---

### platform_support  (level 1)
**CAN:**
- View all tenant accounts and their status
- View tenant audit logs (read-only)
- Suspend / unsuspend a tenant with reason

**CANNOT:**
- Delete tenants permanently
- Access billing or subscription management
- See any tenant's transaction data

---

### platform_auditor  (level 1)
**CAN:**
- Read-only access to platformAuditLogs
- Export audit logs

**CANNOT:**
- Modify anything at all
- See tenant business data

---

## ▌ TENANT LAYER — All scoped to one tenantId.

### merchant_owner  (level 2)  [replaces: hq_admin, store_owner, tenant_admin]
**CAN:**
- Everything within their tenant — full control
- Create, edit, delete branches and stores
- Create, edit, delete all staff and assign any role at or below their level
- View all reports across all branches (HQ scope)
- Manage billing and subscription for their tenant
- Configure loyalty program, promotions, tax, receipt template, notifications
- Void and refund any transaction regardless of date
- Export all data

**CANNOT:**
- Access other tenants' data (tenantId hard fence)
- Modify platform settings

**Routes visible:** All tenant routes — /dashboard, /pos, /products, /inventory, /customers, /reports, /staff, /settings, /promotions, /documents, /restaurant
**Permission bits:** ALL P.* except P.PLATFORM_*

---

### merchant_manager  (level 3)  [replaces: hq_manager]
**CAN:**
- View all branches' sales data and reports (HQ scope)
- Manage products, categories, pricing across all branches
- Manage inventory across all branches (including inter-branch transfers)
- Create and manage promotions and coupons
- Manage customers and members
- Create staff at supervisor level and below
- Approve purchase orders
- View all reports

**CANNOT:**
- Delete branches or stores
- Manage tenant billing
- Delete staff accounts (can only deactivate)
- Assign merchant_owner role to anyone

**Routes visible:** All except /settings/billing, branch create/delete
**Permission bits:** SALE_*, PRODUCT_*, INVENTORY_*, PURCHASE_ORDER_*, REPORT_*, CUSTOMER_*, MEMBER_MANAGE, PROMOTION_MANAGE, STAFF_VIEW, STAFF_CREATE, STAFF_UPDATE, STORE_VIEW, STORE_UPDATE

---

### accountant  (level 3)  [new role]
**CAN:**
- View all financial reports across all branches
- Export financial reports (CSV, PDF)
- View GL / P&L reports
- View payment transaction history

**CANNOT:**
- Create or void any sale
- Edit products, inventory, or customer data
- Manage staff
- Change any settings

**Routes visible:** /reports/*, /payments/transactions, /reports/gl, /reports/financial
**Permission bits:** REPORT_SALES, REPORT_FINANCIAL, REPORT_EXPORT, REPORT_DASHBOARD, BILLING_VIEW

---

### supervisor  (level 4)  [replaces: branch_admin, store_manager, branch_manager]
**CAN:**
- View all reports for their assigned branch only
- Manage products at their branch (create, edit — not delete permanently)
- Open and close shifts at their branch
- Apply discounts at POS (up to configured maximum %)
- Void same-day transactions at their branch
- Approve refunds up to configured limit
- View and manage customers and members at their branch
- Create cashier and inventory_staff accounts
- Manage inventory (adjust, count, receive stock, transfer out)

**CANNOT:**
- Access other branches' data
- Delete products permanently
- Create or edit promotions (can apply them)
- Manage tenant-level settings (billing, notifications, tax)
- Assign roles above cashier

**Routes visible:** /pos, /dashboard (branch), /reports (branch-scoped), /inventory/*, /customers, /staff (view + create limited), /promotions (view only)
**Permission bits:** SALE_*, PRODUCT_VIEW, PRODUCT_CREATE, PRODUCT_UPDATE, INVENTORY_*, PURCHASE_ORDER_VIEW, PURCHASE_ORDER_CREATE, REPORT_SALES, REPORT_PRODUCT, REPORT_INVENTORY, REPORT_STAFF, REPORT_CUSTOMER, REPORT_DASHBOARD, STAFF_VIEW, STAFF_CREATE, CUSTOMER_*, MEMBER_MANAGE, STORE_VIEW

---

### senior_cashier  (level 5)  [new role]
**CAN:**
- Create POS sales
- Apply discounts up to a configured maximum percentage
- Process refunds for same-day transactions (own sales only)
- Hold and resume bills
- Assign a customer to a sale (loyalty lookup)
- Apply coupons and active promotions at checkout
- Redeem loyalty points for a customer
- View their own shift summary

**CANNOT:**
- Create or edit products
- Adjust inventory
- View any financial reports
- Manage staff
- Void transactions (must escalate to supervisor)

**Routes visible:** /pos, /pos/held, /pos/credit (view only), /staff/shifts (own shifts only), /customers (view only)
**Permission bits:** SALE_CREATE, SALE_VIEW, SALE_HOLD, SALE_DISCOUNT, SALE_REFUND, CUSTOMER_VIEW

---

### cashier  (level 5)  [replaces: staff]
**CAN:**
- Create POS sales
- Hold and resume bills
- Assign a customer to a sale (lookup by phone/name)
- Apply valid coupons at checkout (system validates)
- Allow loyalty point redemption for customer
- View receipt of their own completed transactions
- Clock in and out of shifts

**CANNOT:**
- Apply manual discounts (no coupon required — cannot freely discount)
- Process refunds or void transactions (must escalate)
- View any reports
- Edit products, inventory, customer records
- Create other users

**Routes visible:** /pos, /pos/held, /staff/shifts (clock in/out only)
**Permission bits:** SALE_CREATE, SALE_VIEW, SALE_HOLD, CUSTOMER_VIEW

---

### inventory_staff  (level 6)
**CAN:**
- Receive incoming stock (purchase order receiving / stock-in)
- Adjust inventory counts with documented reason
- Transfer stock between branches (initiate, not approve)
- View current stock levels and movement history
- View expiry dates and flag expiring items
- Create draft purchase orders (cannot approve)
- View vendors list

**CANNOT:**
- Create POS sales or process refunds
- Edit product prices or create new products
- View financial reports or customer data
- Manage staff accounts

**Routes visible:** /inventory/*, /inventory/purchase-orders, /inventory/vendors
**Permission bits:** INVENTORY_VIEW, INVENTORY_ADJUST, INVENTORY_TRANSFER, INVENTORY_COUNT, PURCHASE_ORDER_VIEW, PURCHASE_ORDER_CREATE, PRODUCT_VIEW

---

### kitchen_staff  (level 6)
**CAN:**
- View incoming kitchen orders on the KDS (Kitchen Display System)
- Mark individual order items as prepared / ready
- See which table sent the order

**CANNOT:**
- Create orders
- Modify any prices or items
- View any financial data

**Routes visible:** /restaurant/kitchen only
**Permission bits:** (restaurant order read + kitchen status update — no POS permissions)

---

### waiter  (level 6, restaurant mode only)
**CAN:**
- Create and modify table orders
- Send items to kitchen
- View table map and table status
- View reservation list
- Assign a customer to a table
- Trigger payment (sends to cashier or completes via QR)

**CANNOT:**
- Apply manual discounts
- Void transactions
- View financial reports
- Manage inventory or products

**Routes visible:** /restaurant/*, /restaurant/tables, /restaurant/orders, /pos (complete checkout only)
**Permission bits:** SALE_CREATE, CUSTOMER_VIEW, (restaurant: TABLE_MANAGE, ORDER_CREATE)

---

## ▌ ROLE HIERARCHY — Used in ROLE_LEVELS map and role-assignment enforcement

```
Level 1 — platform_super_admin, platform_support, platform_auditor
Level 2 — merchant_owner        (legacy aliases: hq_admin, store_owner, tenant_admin)
Level 3 — merchant_manager      (legacy alias: hq_manager)
           accountant
Level 4 — supervisor            (legacy aliases: branch_admin, store_manager, branch_manager)
Level 5 — senior_cashier
           cashier               (legacy alias: staff)
Level 6 — inventory_staff
           kitchen_staff
           waiter
```

**Role assignment rule:** You can only assign a role with a HIGHER level number than your own.
- merchant_manager (3) → can assign level 4, 5, 6
- supervisor (4) → can assign level 5, 6 only
- cashier (5) → cannot assign anyone

---

## ▌ SCREEN ACCESS MATRIX

| Screen | merchant_owner | merchant_manager | accountant | supervisor | senior_cashier | cashier | inventory_staff |
|--------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| /dashboard | ✅ all | ✅ all | ✅ view | ✅ branch | ✅ today | ❌ | ❌ |
| /pos | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| /products | ✅ CRUD | ✅ CRUD | ❌ | ✅ C+U | ❌ | ❌ | view |
| /inventory | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| /customers | ✅ CRUD | ✅ CRUD | ❌ | ✅ C+U | view | view | ❌ |
| /promotions | ✅ | ✅ | ❌ | view | ❌ | ❌ | ❌ |
| /reports | ✅ all | ✅ all | ✅ financial | ✅ branch | ❌ | ❌ | ❌ |
| /staff | ✅ | ✅ limited | ❌ | ✅ limited | ❌ | ❌ | ❌ |
| /settings | ✅ all | limited | ❌ | ❌ | ❌ | ❌ | ❌ |
| /restaurant | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| /documents | ✅ | ✅ | ✅ | view | ❌ | ❌ | ❌ |
| /admin | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## ▌ WHAT NO ROLE CAN EVER DO  (hard middleware rules)

1. Access another tenant's data — `eq(table.tenantId, authUser.tenantId)` on every query
2. Read tokens of other users — JWT is identity-only, no role/permissions in payload
3. Elevate their own role — users cannot update their own `roleId`
4. Delete audit log entries — DB trigger blocks UPDATE/DELETE on activityLogs
5. Access platform routes with a merchant scope — `platformScopeGuard` enforces separation
6. Transact while merchant is suspended — `merchantStatusMiddleware` checks Redis
7. Use a revoked token — `revoked:{jti}` Redis check on every authenticated request

---

## ▌ PERMISSION BIT ASSIGNMENTS (source of truth for seed + systemRolePermissions.ts)

```
merchant_owner    → ALL permissions except PLATFORM_*
merchant_manager  → SALE_* + PRODUCT_* + INVENTORY_* + PURCHASE_ORDER_* + REPORT_* +
                    CUSTOMER_* + MEMBER_MANAGE + PROMOTION_MANAGE +
                    STAFF_VIEW + STAFF_CREATE + STAFF_UPDATE + STORE_VIEW + STORE_UPDATE
accountant        → REPORT_SALES + REPORT_FINANCIAL + REPORT_EXPORT + REPORT_DASHBOARD + BILLING_VIEW
supervisor        → SALE_* + PRODUCT_VIEW + PRODUCT_CREATE + PRODUCT_UPDATE +
                    INVENTORY_* + PURCHASE_ORDER_VIEW + PURCHASE_ORDER_CREATE +
                    REPORT_SALES + REPORT_PRODUCT + REPORT_INVENTORY + REPORT_STAFF +
                    REPORT_CUSTOMER + REPORT_DASHBOARD +
                    STAFF_VIEW + STAFF_CREATE + CUSTOMER_* + MEMBER_MANAGE + STORE_VIEW
senior_cashier    → SALE_CREATE + SALE_VIEW + SALE_HOLD + SALE_DISCOUNT + SALE_REFUND + CUSTOMER_VIEW
cashier           → SALE_CREATE + SALE_VIEW + SALE_HOLD + CUSTOMER_VIEW
inventory_staff   → INVENTORY_* + PURCHASE_ORDER_VIEW + PURCHASE_ORDER_CREATE + PRODUCT_VIEW
kitchen_staff     → (restaurant orders only — no POS bits)
waiter            → SALE_CREATE + CUSTOMER_VIEW + (restaurant: table + order bits)
```
