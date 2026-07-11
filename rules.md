# KPOS — Rules and Role-Rules Reference

Last updated: 2026-06-24

`rules` and `role_rules` are the module/menu access layer. They do not replace the normal backend permission checks; backend routes still mostly use permission strings/bitmasks through `authorize(...)` and `requirePerm(...)`.

## Source of truth

Default role/rule data is defined in:

- `APIS/src/shared/defaultAccessControl.ts`

Operational callers now use that shared source:

- `APIS/src/db/seed-demo.ts`
- `APIS/src/modules/admin/presentation/routes.ts`

This avoids drift between CLI/demo seed and admin seed/template APIs.

## What a rule is

A `rule` row represents one app module, for example `sales`, `inventory`, or `reports`.

It stores:

- UI route paths used for menu/sidebar visibility, such as `/reports/gl`
- permission strings related to the module, such as `reports:view`
- module metadata: display name, module key, icon, order

`role_rules` stores the CRUD matrix for a role and rule:

```text
(tenantId, roleId, ruleId) -> canRead, canCreate, canUpdate, canDelete
```

The frontend-facing user menu endpoints use `role_rules.canRead` as the primary menu visibility source, with legacy role permissions as fallback for older data.

## Current default rules

There are 17 default rules:

| Rule | Routes | Permissions |
|---|---|---|
| `dashboard` | `/dashboard` | `dashboard:view` |
| `sales` | `/pos`, `/pos/credit`, `/pos/held` | `sales:*` plus `pos:access`, `pos:discount`, `pos:void`, `pos:credit` |
| `products` | `/products`, `/products/sku`, `/products/pricing`, `/categories`, `/barcode` | `products:*`, `products:import`, `categories:*` |
| `inventory` | `/inventory`, `/inventory/stockin`, `/inventory/stockout`, `/inventory/adjust`, `/inventory/transfer`, `/inventory/count`, `/inventory/purchase-orders`, `/inventory/vendors`, `/inventory/expiry`, `/inventory/out-of-stock` | `inventory:view/create/update/delete/transfer/adjust/stockin/stockout` |
| `restaurant` | `/restaurant/tables`, `/restaurant/orders`, `/restaurant/kitchen`, `/restaurant/reservations`, `/restaurant/e-menu` | `restaurant:view`, `restaurant:manage`, `tables:view/create/update/delete` |
| `promotions` | `/promotions`, `/promotions/coupons`, `/promotions/discounts` | `promotions:view/create/update/delete` |
| `customers` | `/customers`, `/customers/members`, `/customers/points`, `/customers/loyalty` | `customers:view/create/update/delete` |
| `payments` | `/payments`, `/payments/transactions`, `/payments/settlements` | `payments:view/create/void/settle/manage` |
| `documents` | `/documents`, `/documents/design`, `/documents/invoices`, `/documents/tax-invoices` | `documents:view/create/update/delete` |
| `reports` | `/reports`, `/reports/products`, `/reports/inventory`, `/reports/financial`, `/reports/staff`, `/reports/customers`, `/reports/promotions`, `/reports/period-compare`, `/reports/branch-compare`, `/reports/gl` | `reports:view/export/sales/inventory/financial/staff` |
| `branches` | `/branches` | `branches:view/create/update/delete` |
| `management.stores` | `/management/stores`, `/my-store`, `/store-request` | `stores:view/create/update/delete/assign` |
| `management.staff` | `/staff`, `/staff/shifts`, `/management/shifts` | `staff:view/create/update/delete` |
| `management.roles` | `/staff/roles` | `roles:view/create/update/delete` |
| `management.operations` | `/management/cashregisters` | `stores:view`, `stores:update` |
| `settings` | `/settings`, `/settings/display`, `/settings/receipt`, `/settings/tax`, `/settings/payments`, `/settings/printers`, `/settings/notifications`, `/settings/integrations`, `/settings/profile` | `settings:view/update` |
| `admin` | `/admin`, `/admin/stores`, `/admin/requests`, `/admin/branches`, `/admin/users`, `/admin/roles`, `/admin/positions`, `/admin/rules`, `/admin/audit`, `/admin/permissions`, `/admin/enums` | `*`, `admin:access`, `admin:view`, `admin:manage` |

## Current schema

```sql
CREATE TABLE rules (
  id           uuid PRIMARY KEY,
  tenant_id    uuid,
  name         text NOT NULL,
  display_name text NOT NULL,
  description  text,
  module       text NOT NULL,
  icon         text,
  routes       text[] NOT NULL DEFAULT '{}',
  permissions  text[] NOT NULL DEFAULT '{}',
  "order"      integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  is_system    boolean NOT NULL DEFAULT false,
  created_at   timestamp NOT NULL DEFAULT now(),
  updated_at   timestamp NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE role_rules (
  id          uuid PRIMARY KEY,
  tenant_id   uuid,
  role_id     uuid NOT NULL,
  rule_id     uuid NOT NULL,
  can_read    boolean NOT NULL DEFAULT true,
  can_create  boolean NOT NULL DEFAULT false,
  can_update  boolean NOT NULL DEFAULT false,
  can_delete  boolean NOT NULL DEFAULT false,
  UNIQUE (role_id, rule_id)
);
```

Relations to `roles` and `rules` are declared in `APIS/src/db/schema/relations.ts`.

## APIs

Admin rule APIs:

```text
GET    /api/v1/admin/rules
GET    /api/v1/admin/rules/matrix
PUT    /api/v1/admin/rules/matrix
POST   /api/v1/admin/rules/seed
GET    /api/v1/admin/roles/:id/rules
PUT    /api/v1/admin/roles/:id/rules
```

User-facing menu/rules APIs:

```text
GET    /api/v1/users/me/menu
GET    /api/v1/users/me/rules
```

There is also a `/api/v1/rules` module for role-rule assignment management protected by normal permissions.

## Runtime model

- Menu visibility: `role_rules.canRead` first, legacy `roles.permissions[]` fallback.
- Backend route access: permission string/bitmask checks from `req.authUser`.
- Cache: auth user data is Redis-cached; role-rule changes call cache invalidation helpers where admin endpoints mutate the matrix.

## Known design notes

- Keep `rules.permissions[]` aligned with valid permission strings from role permissions.
- Do not add hardcoded route/rule copies in another file; update `APIS/src/shared/defaultAccessControl.ts`.
- If a new report/page is added and should appear in menu permission management, add its UI route to the correct rule.
