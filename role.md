# KPOS — Roles System Reference

Last updated: 2026-06-24

`roles` are the primary permission carrier for users. Each user has one `roleId`; the role stores string permissions plus a computed bitmask.

## Source of truth

Default role/rule data is defined in:

- `APIS/src/shared/defaultAccessControl.ts`

Default runtime fallback permission arrays are defined in:

- `APIS/src/shared/systemRolePermissions.ts`

Operational callers now use the shared default access-control source:

- `APIS/src/db/seed-demo.ts`
- `APIS/src/modules/admin/presentation/routes.ts`

## Role table

Current schema fields:

- `id`
- `tenantId` — `NULL` means platform/system template
- `branchId` — `NULL` means tenant-wide role; UUID means branch-specific role
- `name`
- `displayName`
- `description`
- `permissions: text[]`
- `isSystem`
- `maskLow`, `maskHigh` — 128-bit bitmask computed from `permissions`
- `createdAt`, `updatedAt`

Unique constraint:

```text
(tenantId, branchId, name)
```

## Role scope

```text
tenantId = NULL    -> platform/system template
tenantId = X       -> tenant-owned role
branchId = NULL    -> tenant-wide role
branchId = Y       -> branch-specific role
```

Assignment is level-based: a caller can assign roles with a higher numeric level than their own level. Lower number means more powerful.

## Current system roles

Canonical roles for new tenants:

| Role | Level | Purpose |
|---|---:|---|
| `super_admin` | 1 | Full platform access |
| `admin` | 1 | Platform admin with tenant operations access |
| `merchant_owner` | 2 | Tenant owner; replaces `hq_admin` / `store_owner` |
| `merchant_manager` | 3 | Cross-branch manager; replaces `hq_manager` |
| `accountant` | 3 | Financial/report access |
| `supervisor` | 4 | Branch operations; replaces `branch_admin` / `store_manager` |
| `senior_cashier` | 5 | POS cashier with discount/refund ability |
| `staff` | 5 | Basic staff role |

Legacy roles kept for backward compatibility:

| Role | Level |
|---|---:|
| `hq_admin` | 2 |
| `store_owner` | 2 |
| `tenant_admin` | 2 |
| `hq_manager` | 3 |
| `branch_admin` | 4 |
| `branch_manager` | 4 |
| `store_manager` | 4 |
| `store_admin` | 4 |
| `manager` | 4 |
| `cashier` | 5 |
| `inventory_staff` | 6 |
| `kitchen_staff` | 6 |
| `waiter` | 6 |

`store_admin` / `store_manager` are level 4 and can create/update/assign lower-level staff roles when their permissions include `staff:create`, `staff:update`, and role assignment rules allow the target level.

## Runtime auth flow

```text
1. Login creates JWT.
2. authenticate() validates JWT.
3. loadCachedAuthUser() checks Redis key kpos:auth:{userId}.
4. On cache miss, DB role permissions are loaded and merged with fallback system role permissions if needed.
5. permissionsToMask() computes maskLow/maskHigh.
6. req.authUser includes permissions, maskLow, and maskHigh.
7. authorize('permission:string') checks string permissions.
8. requirePerm(P.BIT) checks the bitmask.
```

Important: the old note saying `maskLow/maskHigh` are not spread onto `req.authUser` is no longer correct. Current `auth.middleware.ts` includes both fields on `req.authUser`.

## Permission strings

Valid permission strings are exposed from the roles/users/staff permission-group APIs and include:

```text
dashboard:view

pos:access, pos:sell, pos:discount, pos:refund, pos:void, pos:credit

products:read, products:view, products:create, products:update, products:delete, products:import
categories:read, categories:view, categories:create, categories:update, categories:delete

inventory:read, inventory:view, inventory:create, inventory:update, inventory:delete,
inventory:adjust, inventory:transfer, inventory:stockin, inventory:stockout

sales:read, sales:view, sales:create, sales:update, sales:delete,
sales:export, sales:void, sales:refund, sales:view-own

customers:read, customers:view, customers:create, customers:update, customers:delete

reports:view, reports:export, reports:sales, reports:inventory, reports:financial, reports:staff

staff:read, staff:view, staff:create, staff:update, staff:delete
users:read, users:view, users:create, users:update, users:delete
roles:read, roles:view, roles:create, roles:update, roles:delete

settings:read, settings:view, settings:update
branches:read, branches:view, branches:create, branches:update, branches:delete
stores:read, stores:view, stores:create, stores:update, stores:delete, stores:assign, stores:products

promotions:read, promotions:view, promotions:create, promotions:update, promotions:delete

restaurant:access, restaurant:view, restaurant:manage, restaurant:tables, restaurant:kitchen, restaurant:reservations
tables:view, tables:create, tables:update, tables:delete

payments:read, payments:view, payments:create, payments:refund, payments:settings,
payments:manage, payments:void, payments:settle

documents:read, documents:view, documents:create, documents:update, documents:delete
```

`*` grants all permissions and should remain limited to `super_admin`.

## Role APIs

```text
GET    /api/v1/roles
GET    /api/v1/roles/:id
POST   /api/v1/roles
PUT    /api/v1/roles/:id
DELETE /api/v1/roles/:id
POST   /api/v1/roles/:id/assign
GET    /api/v1/roles/permissions
GET    /api/v1/roles/levels
```

Admin template/seed APIs:

```text
GET    /api/v1/admin/roles/templates
POST   /api/v1/admin/roles/seed
POST   /api/v1/admin/rules/seed
```

## Cache invalidation

When role permissions or assignments change:

- role auth cache is invalidated through permission-service helpers
- user-store cache is invalidated for assignment/store changes
- role-rule cache is invalidated when admin rule matrix endpoints mutate rules

Main Redis keys:

```text
kpos:auth:{userId}
kpos:stores:{userId}
kpos:rules:{roleId}
```

## Known design notes

- `users.roleId` means a user currently has one primary role.
- `user_role_assignments` exists in schema but is not the active runtime model.
- Legacy aliases remain in `ROLE_LEVELS` for backward compatibility.
- Add new default roles/rules in `APIS/src/shared/defaultAccessControl.ts`, not separately in seed/admin files.
