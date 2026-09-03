# KPOS Target Flow and Four-Phase Fix Plan

> ເອກະສານນີ້ແມ່ນແຜນຫຼັກສຳລັບຢຸດການແກ້ flow ແບບປ່ຽນໄປມາ. ຈະບໍ່ເລີ່ມແກ້ code ຈົນກວ່າ Phase 1 ຈະຖືກຢືນຢັນ.

## 1. ຄຳຕັດສິນຫຼັກ

ລະບົບຈະໃຊ້ authorization model ດຽວທັງ platform, tenant ແລະ branch:

| ສ່ວນ | ໜ້າທີ່ | ເປັນ source of truth ບໍ? |
|---|---|---|
| Permission Catalog | ລາຍການສິດລະອຽດ ເຊັ່ນ `sales:create` | ແມ່ນ |
| Rule | ກຸ່ມ module/CRUD ສຳລັບ UI ແລະການຈັດການ | ບໍ່ແມ່ນ authority ໂດຍລຳພັງ |
| Role | ຊຸດຂອງ permission grants ໃນ scope ໜຶ່ງ | ແມ່ນ |
| User assignment | role + store/branch + workflow flags | ແມ່ນ |
| Menu | ສະແດງສິ່ງທີ່ user ເຂົ້າເຖິງໄດ້ | ບໍ່ແມ່ນ |
| `roles.permissions`, mask, cache | ຄ່າທີ່ຄຳນວນໄວ້ເພື່ອ performance/legacy | ບໍ່ແມ່ນ |

### ຫຼັກການບັງຄັບ

1. API ກວດ `effective permissions` ຈາກ permission catalog + role grants + user override + scope.
2. Menu ບໍ່ສາມາດເພີ່ມສິດໃຫ້ user; ມັນສະແດງຕາມ effective access ເທົ່ານັ້ນ.
3. `Rule` ເປັນວິທີຈັດກຸ່ມ permission ແລະ CRUD ໃນ UI; ການອະນຸຍາດສຸດທ້າຍຕ້ອງລົງທີ່ permission key.
4. `roles.permissions` ແລະ bitmask ຕ້ອງເປັນ projection ທີ່ລະບົບສ້າງ/ອັບເດດອັດຕະໂນມັດ; UI ຫ້າມຂຽນແຍກຈາກ role grants.
5. ທຸກ role ຕ້ອງມີ `level` ໃນ database. ຫ້າມຄຳນວນ privilege ຈາກ role name ເປັນຫຼັກ.
6. `*` ໃຊ້ໄດ້ສະເພາະ Super Admin ແລະຫ້າມໃຊ້ເພື່ອຂ້າມ tenant/branch boundary.
7. ການປ່ຽນ access, staff workflow ແລະ approval ທຸກອັນຕ້ອງມີ audit event.
8. Backend ເປັນ security boundary; frontend ເປັນ UX boundary ເທົ່ານັ້ນ.

## 2. Role ແລະ scope ເປົ້າໝາຍ

| ລະດັບ | ຜູ້ໃຊ້ | ຂອບເຂດ | ສິ່ງທີ່ຈັດການໄດ້ |
|---:|---|---|---|
| 1 | Super Admin | Platform | permission catalog, rules, global role templates, tenants, audit platform |
| 2 | Store Owner / Tenant Admin | Tenant ຕົນເອງ | copy/customize tenant roles, stores, branches, staff, workflow, tenant audit |
| 3-4 | HQ Admin / HQ Manager | Tenant ຕາມ policy | stores/branches ແລະ staff ຕາມ permission ທີ່ໄດ້ຮັບ |
| 5-6 | Branch Admin / Branch Manager | Branch ຕົນເອງ | branch staff, branch workflow, branch operations |
| 7 | Staff / Cashier | Store/branch ທີ່ຖືກມອບໝາຍ | ເຮັດງານຕາມ permission, maker/checker ແລະ shift |

Custom role ສາມາດສ້າງໄດ້, ແຕ່ຕ້ອງເລືອກ `level` ຢ່າງຊັດເຈນ ແລະຫ້າມເກີນ level ຂອງຜູ້ສ້າງ.

## 3. Target flow ທີ່ຕ້ອງໄດ້ຫຼັງແກ້

### 3.1 Super Admin ກຳນົດ catalog

1. ສ້າງ/ກວດ permission group.
2. ສ້າງ permission key ທີ່ unique ແລະມີ description.
3. ສ້າງ Rule ແລະຜູກ CRUD ເຂົ້າກັບ permission key.
4. ສ້າງ global role template.
5. ເບິ່ງ `Menu Preview` ແລະ `Effective Permission Preview`.
6. Publish/version catalog.
7. ທຸກຂັ້ນຕອນບັນທຶກ platform audit.

**ຜົນຫຼັງແກ້:** Super Admin ຮູ້ວ່າ permission ໃດໃຊ້ກັບ API, rule ໃດຈັດ UI ແລະ menu ໃດຈະເຫັນ.

### 3.2 Store Owner ນຳ template ໄປໃຊ້

1. ເຫັນ global template ແບບ read-only.
2. ກົດ `Copy to my tenant`.
3. ໄດ້ tenant role ໃໝ່ທີ່ມີ `sourceTemplateId`.
4. ປັບໄດ້ສະເພາະ permission ທີ່ owner ຖື.
5. ລະບົບສະແດງວ່າແຕ່ລະ permission ມາຈາກ template, tenant override ຫຼື user override.
6. ບັນທຶກ audit ແລະ invalidate cache ຂອງ user ທີ່ກ່ຽວຂ້ອງ.

**ຜົນຫຼັງແກ້:** Store Owner ບໍ່ສາມາດແກ້ global role ຂອງຮ້ານອື່ນ ແລະ UI ຈະບໍ່ສະແດງ global role ເປັນ role ທີ່ assign ໄດ້ໂດຍກົງ.

### 3.3 ກຳນົດ staff

1. Owner/Branch Admin ເລືອກ staff.
2. ເລືອກ role ຈາກ role ທີ່ assignable ໃນ scope ຂອງຕົນ.
3. ເລືອກ store/branch ດ້ວຍ search ແລະ pagination.
4. ກຳນົດ Maker, Checker, Requires Shift.
5. UI ສະແດງຄຳເຕືອນຖ້າ role ບໍ່ມີ permission ທີ່ສອດຄ່ອງ.
6. ບັນທຶກ profile + workflow ໃນ transaction ດຽວ.
7. ສະແດງ effective access ຫຼັງບັນທຶກ.

**ກົດສຳຄັນ:** ຖ້າ staff ບໍ່ໄດ້ permission ຈາກ owner ຈະບໍ່ສາມາດແກ້ role/permission ຕົນເອງ. ປຸ່ມຈັດການຕ້ອງບໍ່ສະແດງ, ແລະ API ຕ້ອງກວດຊ້ຳ.

### 3.4 Maker/Checker flow

1. User ກວດ authentication.
2. API ກວດ tenant/store/branch scope.
3. API ກວດ permission ຂອງ action.
4. API ກວດ Maker ສຳລັບ create/update.
5. ບັນທຶກ transaction ເປັນ `PENDING_APPROVAL` ຖ້າ policy ບັງຄັບ.
6. Checker ເຫັນສະເພາະລາຍການທີ່ຢູ່ໃນ scope ແລະຕົນມີ permission.
7. ຫ້າມ self-approval ເປັນ default ຖ້າມີ checker ຄົນອື່ນ.
8. Owner ສາມາດເປັນ Maker + Checker ໄດ້ຕາມ policy ຮ້ານ; ການ self-approve ຕ້ອງມີ audit reason.
9. Approval transition ຕ້ອງ atomic/idempotent ເພື່ອກັນການອະນຸມັດຊ້ຳ.

### 3.5 Audit flow

Audit event ຕ້ອງມີຢ່າງໜ້ອຍ:

- actor user ID
- target user/role/rule/resource ID
- tenant/store/branch ID
- action ແລະ result
- before/after summary
- reason/comment ສຳລັບ approval ຫຼື self-approval
- timestamp, IP, user agent, correlation ID

ໜ້າ audit ຈະມີ submenu:

- Overview
- Activity
- Sales
- Inventory
- Staff
- Access: Roles / Rules / Permissions
- Maker-Checker
- Security

ການມີ submenu ບໍ່ພໍ; ຕ້ອງກວດວ່າ mutation ແຕ່ລະຈຸດສ້າງ event ຈິງ.

## 4. ແຜນແກ້ 4 ໄລຍະ

## Phase 1 — Policy and Contract Freeze

### ຕ້ອງແກ້ຫຍັງ

- ຢືນຢັນ Permission, Rule, Role, User Override ໃຫ້ບໍ່ຊ້ຳຄວາມໝາຍ.
- ກຳນົດ canonical authorization model.
- ກຳນົດ role level ແລະ scope matrix.
- ກຳນົດວ່າ role ໃດ assign ໄດ້, role ໃດເປັນ template.
- ກຳນົດ Maker/Checker policy ຕາມ action.
- ກຳນົດ audit event catalog.

### ເຫດຜົນ

ຖ້າບໍ່ freeze policy ກ່ອນ, ການແກ້ UI ຫຼື API ຈະເຮັດໃຫ້ flow ປ່ຽນຊ້ຳ ແລະສ້າງ bug ໃໝ່.

### ຜົນຫຼັງຈົບ Phase 1

- ມີ authorization matrix ສະບັບດຽວ.
- ທີມງານຮູ້ວ່າຈະອ່ານ/ຂຽນ table ໃດ.
- ຮູ້ວ່າການກົດປຸ່ມໃດຕ້ອງຜ່ານ Maker/Checker.
- ບໍ່ອະນຸຍາດ requirement ໃໝ່ທີ່ຂັດກັບ matrix ໂດຍບໍ່ແກ້ເອກະສານ.

## Phase 2 — Backend Authorization and Data Integrity

### ຕ້ອງແກ້ຫຍັງ

- ລວມ `/roles` ແລະ `/admin/roles` ຫຼືກຳນົດ service/contract ກາງ.
- ໃຫ້ role grants ເປັນ canonical; `roles.permissions`/mask ເປັນ projection.
- ປ່ຽນ role-name checks ເປັນ DB `role.level`.
- ບັງຄັບ tenant/store/branch scope ໃນທຸກ endpoint.
- ກັນ wildcard `*` ແລະ null tenant ໃຫ້ fail closed.
- ເພີ່ມ `assignable`, `isTemplate`, `sourceTemplateId` ໃນ role response.
- ເຮັດ transaction ສຳລັບ staff profile + workflow.
- ສ້າງ action registry ວ່າ action ໃດຕ້ອງ Maker/Checker.
- ບັງຄັບ audit event ທຸກ access/workflow mutation.
- ໃຫ້ menu API ຕອບ 503 ເມື່ອ authorization infrastructure ລົ້ມ, ບໍ່ຕອບ success ແບບວ່າງ.
- ຈັດ cache version/invalidation ໃຫ້ກົງກັນທຸກ user ທີ່ຖື role.

### ເຫດຜົນ

ຈຸດນີ້ແມ່ນ security boundary. ຖ້າ backend ບໍ່ມີ policy ດຽວ, UI ຈະແກ້ດີແຄ່ໃດກໍຍັງມີ 403, access leak ຫຼື permission ບໍ່ອັບເດດ.

### ຜົນຫຼັງຈົບ Phase 2

- Role Tree, Access Control Matrix, Menu ແລະ API ຈະໃຫ້ຜົນດຽວກັນ.
- Custom role ເຮັດວຽກຕາມ level ຈິງ.
- Store Owner A ບໍ່ສາມາດເຫັນ/ແກ້ Store Owner B.
- Global template ບໍ່ຖືກ assign ໂດຍກົງຈາກ tenant.
- ການປ່ຽນ permission ສະແດງຜົນໃນ user session ຫຼັງ cache invalidation.

## Phase 3 — UI/UX and Workflow Simplification

### ຕ້ອງແກ້ຫຍັງ

ຈັດ Access Control ໃໝ່ເປັນ workspace ດຽວ:

1. **Catalog** — Super Admin ຈັດການ permissions ແລະ rules.
2. **Role Templates** — global role ແບບ read-only/copy.
3. **Tenant Roles** — Store Owner ສ້າງ/ປັບ tenant role.
4. **People & Access** — ມອບ role, store, branch ແລະ workflow ໃຫ້ user.
5. **Effective Access** — ກວດສິດສຸດທ້າຍຂອງ user.

Role Tree ຈະໃຊ້ custom node content:

- module icon + label
- description
- CRUD checkboxes
- permission count
- inherited/overridden badge
- lock state ສຳລັບ global template
- preview action

ຕັດສິ່ງທີ່ສັບສົນ:

- ບໍ່ສະແດງປຸ່ມ Add/Edit ຖ້າ user ບໍ່ມີ permission.
- ບໍ່ສະແດງ global role ເປັນ assignable role.
- ບໍ່ສະແດງ shift dialog ຖ້າ `requiresShift=false`.
- ບໍ່ໃຫ້ staff ແກ້ permission ຕົນເອງ.
- ໃຊ້ empty/error/loading state ທີ່ບອກສາເຫດ ແລະມີ Retry.

### ເຫດຜົນ

ປັນຫາຂອງ UI ປັດຈຸບັນບໍ່ແມ່ນສີ/ຮູບແບບເທົ່ານັ້ນ; ແຕ່ແມ່ນ user ບໍ່ຮູ້ວ່າ permission ທີ່ຕົນກຳນົດຈະມີຜົນກັບ menu, API ແລະ workflow ແນວໃດ.

### ຜົນຫຼັງຈົບ Phase 3

- Owner ກຳນົດ staff ໄດ້ໃນໜ້າດຽວ.
- Branch Admin ເຫັນສະເພາະ branch ຕົນ.
- Staff ເຫັນສະເພາະ menu/action ທີ່ມີສິດ.
- ຜູ້ໃຊ້ເຫັນທັນທີວ່າ access ມາຈາກ role ຫຼື override.
- UI ບໍ່ສ້າງຄວາມຄາດຫວັງທີ່ backend ເຮັດບໍ່ໄດ້.

## Phase 4 — Full QA, Scale and Release Gate

### ຕ້ອງກວດ

#### RBAC matrix

- Super Admin ຂ້າມ tenant ໄດ້ຕາມ policy.
- Owner tenant A ບໍ່ເຫັນ tenant B.
- Branch Admin A ບໍ່ເຫັນ branch B.
- Staff ບໍ່ຈັດການ roles/permissions ຖ້າບໍ່ໄດ້ຮັບສິດ.
- Custom role ໃຊ້ level ຖືກຕ້ອງ.
- Global role ຖືກ copy ກ່ອນ assign.

#### Maker/Checker

- Maker ສ້າງລາຍການໄດ້.
- ຄົນບໍ່ແມ່ນ Maker ເຮັດ action ບໍ່ໄດ້.
- Checker ອະນຸມັດໄດ້ສະເພາະ scope ຂອງຕົນ.
- self-approval ຖືກຫ້າມ/ອະນຸຍາດຕາມ policy.
- approval ຊ້ຳບໍ່ເກີດ stock/sale ຊ້ຳ.
- ທຸກການ approve/reject ມີ audit.

#### Scale

- 3 tenants.
- 10 stores.
- 30 branches.
- 100-1,000 staff.
- 20+ roles ແລະ 100+ permissions.
- branch selector ຄົ້ນຫາໄດ້ເກີນ 300 records.
- menu/rules cache ບໍ່ສ້າງ request storm.

#### CI/Release

- ເລືອກ package manager ດຽວ ແລະ lockfile ຢູ່ຄົບ.
- Vitest ບໍ່ຈັບ Playwright specs.
- API unit/integration tests ຜ່ານ.
- frontend check/build ຜ່ານ.
- Playwright E2E ຮັນກັບ database ທີ່ seed ແບບ deterministic.
- migration ມີ backup/rollback plan.
- monitoring ກວດ 401/403/5xx, queue failure, audit failure ແລະ cache invalidation.

### ຜົນຫຼັງຈົບ Phase 4

ຈຶ່ງຈະຖືວ່າພ້ອມ production ເມື່ອ:

- Permission, Rule, Role, Menu ໃຫ້ຜົນສອດຄ່ອງ.
- ບໍ່ມີ cross-tenant/cross-branch access.
- ທຸກ access mutation ມີ audit.
- Maker/Checker ຄຸ້ມຄອງ sensitive actions ຄົບ.
- UI ບໍ່ສະແດງປຸ່ມທີ່ user ເຮັດບໍ່ໄດ້.
- ທົດສອບ scale ແລະ failure recovery ຜ່ານ.
- CI ສາມາດ install, build ແລະ test ຈາກ clean checkout ໄດ້.

## 5. ສິ່ງທີ່ຈະບໍ່ແກ້ປ່ຽນໄປມາອີກ

1. ບໍ່ປ່ຽນຄວາມໝາຍ Permission/Rule/Role ໂດຍບໍ່ອັບເດດ document ນີ້.
2. ບໍ່ເພີ່ມ role name ໃໝ່ເພື່ອແກ້ authorization bug; ໃຊ້ level + permission.
3. ບໍ່ແກ້ດ້ວຍ frontend ຢ່າງດຽວຖ້າເປັນ security rule.
4. ບໍ່ເພີ່ມ hardcoded fallback ໃໝ່ໃນ permission/menu.
5. ທຸກ feature ໃໝ່ຕ້ອງລະບຸ scope, permission, maker/checker, audit ແລະ test case ກ່ອນລົງ code.

## 6. Definition of Done ສຳລັບການແກ້ຮອບນີ້

- [ ] Phase 1 matrix ແລະ policy ຖືກຢືນຢັນ.
- [ ] ມີ canonical authorization source ອັນດຽວ.
- [ ] Custom role ແລະ scope ຖືກກວດດ້ວຍ DB level.
- [ ] Global template/tenant role/branch role ແຍກຊັດ.
- [ ] Role/rule/permission/workflow mutation ມີ audit.
- [ ] Menu Preview ແລະ Effective Access Preview ໃຫ້ຜົນຈາກ backend ອັນດຽວ.
- [ ] Staff workflow ແກ້ profile + flags ແບບ atomic.
- [ ] Full tenant/branch negative tests ຜ່ານ.
- [ ] Maker/Checker action matrix ຄົບ.
- [ ] Frontend Vitest, Playwright, API tests ແລະ CI ຮັນຈາກ clean checkout ໄດ້.
- [ ] ຈຶ່ງຈະອະນຸຍາດ production release.

## 7. Finance, Expense, Profit & Payroll — ແຜນແກ້ບັນຫາ ແລະ ສ້າງສ່ວນທີ່ຍັງຂາດ

### 7.1 ຜົນກວດປັດຈຸບັນ

ຈາກການກວດ codebase ແລະ read-only API test ພົບວ່າ report endpoint ເຮັດວຽກ ແຕ່ financial model ຍັງບໍ່ຄົບສຳລັບການສະຫຼຸບກຳໄລສຸດທິ ແລະ ເງິນເດືອນ:

- `finance/pl`, `finance/cash-flow`, `finance/tax-summary`, `reports/financial` ແລະ `reports/staff` ຕອບກັບໄດ້; ຂໍ້ມູນເປັນ 0 ເພາະ environment ໃໝ່ຍັງບໍ່ມີ tenant/sales data.
- `reports/financial` ໃຊ້ COGS ເປັນ expenses ເທົ່ານັ້ນ, `previousExpenses` ຍັງເປັນ 0; ດັ່ງນັ້ນ `profit` ຍັງບໍ່ແມ່ນ net profit ຕາມທຸລະກິດຈິງ.
- ການຄຳນວນ discount/tax/net revenue ຢູ່ຫຼາຍ route ບໍ່ໃຊ້ນິຍາມດຽວກັນ; ມີຄວາມສ່ຽງຫັກ discount ຊ້ຳ ຫຼື ນັບ tax ເປັນ revenue.
- ບາງຈຸດຄຳນວນ COGS ບໍ່ຄູນ `quantity`, ເຮັດໃຫ້ summary ແລະ daily breakdown ອາດບໍ່ກົງກັນ.
- Cash movement type ລະຫວ່າງ shift UI, sales API ແລະ finance service ຍັງໃຊ້ຊື່ບໍ່ຄືກັນ; cash-flow ບາງກໍລະນີຈັດ cash-in ເປັນ cash-out.
- ຍັງບໍ່ມີ expense ledger ແລະ payroll domain/table/API/UI; `reports/staff` ແມ່ນລາຍງານຍອດຂາຍ ແລະ ຊົ່ວໂມງ, ບໍ່ແມ່ນການຄຳນວນເງິນເດືອນ.

ຈຸດອ້າງອີງສຳລັບ implementation: `APIS/src/modules/reports/presentation/routes.ts`, `APIS/src/modules/finance/presentation/routes.ts`, `APIS/src/infrastructure/services/cash.service.ts`, ແລະ `kpos/src/routes/(app)/reports/`.

### 7.2 ນິຍາມກາງທີ່ຕ້ອງລັອກກ່ອນຂຽນ code

ຈະໃຊ້ສູດດຽວກັນທັງ API, UI, export ແລະ audit:

```text
Gross Sales       = ຍອດສິນຄ້າກ່ອນ discount
Discounts         = transaction discount ທີ່ອະນຸມັດ
Net Sales         = Gross Sales - Discounts
Tax Collected     = tax ທີ່ເກັບໄດ້ (liability, ບໍ່ແມ່ນກຳໄລ)
COGS              = sum(item cost * quantity)
Gross Profit      = Net Sales - COGS
Operating Expense = expense ledger ທີ່ APPROVED/PAID
Payroll Expense   = payroll run ທີ່ APPROVED/PAID
Net Profit        = Gross Profit - Operating Expense - Payroll Expense
Cash In           = cash sales + deposits + approved cash-in
Cash Out          = refund + expense payment + payroll payment + pickup
Net Cash          = Opening Cash + Cash In - Cash Out
```

ກົດລະບຽບຮ່ວມ:

- ໃຊ້ date range ແບບ `[from, to)` ຕາມ timezone ຂອງ store/branch, ບໍ່ໃຊ້ `from` ຢ່າງດຽວ.
- ແຍກ `gross sales`, `net sales`, `tax`, `discount`, `COGS`, `expense`, `payroll` ອອກຈາກກັນ; ບໍ່ໃຫ້ໃຊ້ຄຳວ່າ expenses ແທນ COGS.
- ລວມສະເພາະ transaction/expense/payroll ທີ່ສະຖານະຖືກຕ້ອງ; void/reversal ຕ້ອງຫັກອອກ ແລະ refund ຕ້ອງມີກົດຊັດ.
- ໃຊ້ decimal/numeric ແລະ rounding policy ດຽວກັນທຸກ layer.
- ທຸກ query ຕ້ອງຈຳກັດ `tenantId`, `storeId`, `branchId`; ຫ້າມເຫັນຂໍ້ມູນຂ້າມຮ້ານ/ຂ້າມສາຂາ.

### 7.3 Phase F0 — Freeze finance contract

1. ກຳນົດ canonical finance service ອັນດຽວເປັນແຫຼ່ງຄຳນວນ; `reports/financial` ຈະຖືກປັບໃຫ້ເອີ້ນ service ດຽວກັນ ຫຼື deprecate ຢ່າງຊັດ.
2. ກຳນົດ DTO ກາງສຳລັບ P&L, cash flow, tax, expense ແລະ payroll; ບໍ່ໃຫ້ແຕ່ລະ route ຄຳນວນເອງ.
3. ຂຽນ policy ສຳລັບ tax-inclusive/tax-exclusive, discount, points, refund, void, payment fee ແລະ partial payment.
4. ແຍກ “ວັນທີຂາຍ”, “ວັນທີອະນຸມັດ”, “ວັນທີຈ່າຍ” ໃຫ້ຊັດ; ລາຍງານແຕ່ລະປະເພດຕ້ອງລະບຸ basis ໃນ UI.

### 7.4 Phase F1 — ແກ້ລາຍງານທີ່ມີຢູ່

- ແກ້ `finance/pl` ແລະ `reports/financial` ໃຫ້ໃຊ້ສູດກາງ, ບໍ່ຫັກ discount ຊ້ຳ ແລະ ບໍ່ນັບ tax ເປັນກຳໄລ.
- ແກ້ COGS ໃຫ້ເປັນ `cost * quantity` ທັງ summary, daily, branch ແລະ export.
- ເພີ່ມ upper bound `createdAt < to` ແລະກຳນົດ previous period ໃຫ້ຖືກ; ເອົາ `previousExpenses: 0` ອອກຈາກ hardcode.
- ແຍກຜົນລັບ `Gross Profit` ແລະ `Net Profit`; ບໍ່ສະແດງ gross profit ໃນຊື່ profit ແບບກວ້າງໆ.
- ກຳນົດ cash movement enum ກາງ (`SALE`, `CASH_IN`, `DEPOSIT`, `REFUND`, `CASH_OUT`, `PICKUP`, `EXPENSE`, `PAYROLL`) ແລະ validate ທີ່ API; ບໍ່ຮັບ type arbitrary.
- ແຍກ shift float/pickup/payout ຈາກ accounting expense; ການເຄື່ອນເງິນຈະບໍ່ກາຍເປັນ expense ຈົນກວ່າຈະມີ category, reason ແລະ approval.
- ໃຊ້ transaction DB ສຳລັບ refund, void, expense payment ແລະ payroll payment ເພື່ອບໍ່ໃຫ້ P&L ແລະ cash flow ແຍກກັນ.

### 7.5 Phase F2 — ສ້າງ Expense Ledger

ສ້າງ `expenses` ເປັນ domain ໃໝ່ ໂດຍມີຢ່າງໜ້ອຍ:

- `id`, tenant/store/branch scope, category, vendor, reference, description, amount, tax, payment method, expenseDate.
- status: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `VOID`, `PAID`.
- `createdBy`, `approvedBy`, `paidBy`, timestamps, reason, attachment metadata ແລະ audit reference.
- category ເຊັ່ນ rent, utilities, bank/payment fee, shipping, marketing, maintenance, tax, other; COGS ຕ້ອງມາຈາກ inventory/sale ບໍ່ໃຫ້ບັນທຶກຊ້ຳ.

API ແລະ workflow:

1. Create draft → submit → maker/checker approve/reject → pay → lock.
2. ມີ list/filter ຕາມ period, branch, category, status ແລະ vendor.
3. ການ approve ແລະ pay ຕ້ອງກວດ permission, scope, amount threshold ແລະ idempotency.
4. ຜູ້ສ້າງບໍ່ສາມາດ approve ຂອງຕົນເອງ ນອກຈາກ policy ຂອງ owner ຈະອະນຸຍາດແບບລະບຸຊັດ.

ສ້າງ UI `Finance > Expenses`: ledger, create/edit, detail, approval queue, payment confirmation, attachment ແລະ audit timeline. Permissions: `expenses:view`, `expenses:create`, `expenses:update`, `expenses:approve`, `expenses:pay`, `expenses:export`.

### 7.6 Phase F3 — ສ້າງ Payroll

ສ້າງ model ໃໝ່ແຍກຈາກ staff sales report:

- `employee_compensation`: user, store/branch, pay type (`MONTHLY`, `DAILY`, `HOURLY`, `COMMISSION`), base rate, allowance, deduction, effectiveFrom/effectiveTo, status.
- `payroll_periods`: period start/end, scope, status `OPEN`, `CALCULATING`, `PENDING_APPROVAL`, `APPROVED`, `PAID`, `CLOSED`.
- `payroll_runs`/`payroll_items`: employee, attendance/hours, base pay, overtime, commission, allowance, deduction, tax/social deduction (ຖ້າ policy ກຳນົດ), netPay ແລະ calculation snapshot.
- `payroll_payments`: paidAt, method, reference, amount, expenseId/cashMovementId, actor ແລະ audit.
- ທຸກການແກ້ salary ຕ້ອງໃຊ້ effective date; ບໍ່ຂຽນທັບປະຫວັດທີ່ຈ່າຍແລ້ວ.

Payroll flow:

1. Owner/admin ກຳນົດ compensation ໃຫ້ employee ພ້ອມ effective date.
2. ເປີດ payroll period; ດຶງຈາກ closed shifts/attendance ແລະ approved adjustment.
3. ຄຳນວນ draft ໃຫ້ maker ກວດ; ການປັບຈຳນວນຕ້ອງມີ reason.
4. Maker submit → checker review/approve; ບັງຄັບ separation of duties ຕາມ policy.
5. ຈ່າຍລາຍຄົນ ຫຼື ຈ່າຍທັງ batch; ສ້າງ expense ປະເພດ payroll ແລະ cash movement ທີ່ link ກັນ.
6. ອອກ payslip; ປິດ period ໃຫ້ immutable. ຖ້າຜິດໃຫ້ໃຊ້ adjustment/reversal ບໍ່ແກ້ທັບ.

Permissions: `payroll:view`, `payroll:compensation`, `payroll:manage`, `payroll:approve`, `payroll:pay`, `payroll:export`. Staff ບໍ່ເຫັນ salary/payroll ຖ້າບໍ່ໄດ້ permission; manager ເຫັນໄດ້ແຕ່ aggregate ຖ້າບໍ່ໄດ້ຮັບ individual-salary permission.

### 7.7 Phase F4 — Backend, security ແລະ audit

- ສ້າງ shared `FinanceCalculationService` ແລະ repository ທີ່ຮອງຮັບ tenant/store/branch scope.
- ກຳນົດ state transition ໃນ server ເທົ່ານັ້ນ; UI ມີໄວ້ແຕ່ສະແດງປຸ່ມຕາມ permission.
- ໃຊ້ DB transaction + idempotency key ສຳລັບ approve/pay/refund ເພື່ອປ້ອງກັນຈ່າຍຊ້ຳ.
- Audit ຕ້ອງບັນທຶກ actor, action, entity, before/after, amount, reason, IP/device (ຕາມ policy), store/branch ແລະ timestamp.
- ເຈົ້າຂອງຮ້ານກວດປະຫວັດ sales, expense, payroll, approval, payment ແລະ export ໄດ້ຕາມ scope; staff ເຫັນສະເພາະ audit ຂອງ action ຕົນເອງ/ທີ່ໄດ້ permission.

### 7.8 Phase F5 — UI/UX ທີ່ຕ້ອງເພີ່ມ

ເມນູຫຼັກ: `Finance` ແລະ submenu `Overview`, `P&L`, `Cash Flow`, `Expenses`, `Payroll`, `Tax`, `Audit`.

ໜ້າ Overview ສະແດງ Net Sales, COGS, Gross Profit, Operating Expenses, Payroll, Net Profit, Cash In, Cash Out ແລະ Tax Payable; ທຸກ card ມີ period/store/branch filter ແລະ tooltip ບອກ calculation basis.

ໜ້າ Payroll ແຍກ 4 ຂັ້ນ: compensation, periods, run preview, payment/payslip. ປຸ່ມຈະສະແດງຕາມ permission ແລະ status; ບໍ່ສະແດງ “salary” ໃນ staff UI ທົ່ວໄປ.

### 7.9 Phase F6 — Migration ແລະ reconciliation

1. ເຮັດ migration dry-run ກ່ອນ; ຫ້າມລົບ transaction, cash movement ຫຼື audit ເກົ່າແບບຖາວອນ.
2. Map cash movement type ເກົ່າເຂົ້າ enum ໃໝ່; generic payout ຈະບໍ່ຖືກສ້າງເປັນ expense ອັດຕະໂນມັດຖ້າບໍ່ມີ category/approval.
3. Backfill COGS ດ້ວຍ `cost * quantity` ແລະສ້າງ reconciliation report ກ່ອນ/ຫຼັງ.
4. ກຳນົດ opening cash ແລະ opening payable ເປັນ adjustment ທີ່ມີ actor/reason; ບໍ່ປົນກັບ sales.
5. ຊ່ວງ rollout ໃຫ້ old/new report ຮັນຄູ່ກັນແບບ read-only ແລະສະແດງ discrepancy ກ່ອນ switch.

### 7.10 Phase F7 — Test plan ກ່ອນປ່ອຍ

Unit tests:

- discount, tax, points, rounding, zero/negative amount, refund, void, partial payment.
- COGS ຫຼາຍ quantity, ຫຼາຍສາຂາ, ຫຼາຍ currency/decimal precision ຕາມ policy.
- payroll monthly/daily/hourly/commission, overtime, deduction, effective-date change ແລະ manual adjustment.

Integration/API tests:

- expense draft → approve → pay → audit; reject/void/reversal; self-approval ຕ້ອງຖືກ block.
- payroll open → calculate → submit → approve → pay → payslip → close; duplicate payment ຕ້ອງ idempotent.
- tenant/owner/branch manager/staff scope; ຫ້າມ cross-store/cross-branch ແລະຫ້າມເຫັນ salary ໂດຍບໍ່ມີ permission.

E2E ຜ່ານ UI:

1. Owner ສ້າງ expense ແລະກຳນົດ checker.
2. Checker ກວດ/approve, ຈ່າຍ, ເຫັນ audit timeline.
3. Owner ກຳນົດ salary ໃຫ້ staff 2 ສາຂາ, ເປີດ payroll period, ກວດ run, approve, pay ແລະອອກ payslip.
4. ກວດວ່າ P&L, expense ledger, payroll total ແລະ cash-flow ກົງກັນ; ກວດ negative cases ທຸກ role.

Reconciliation invariants:

```text
Gross Sales - Discounts = Net Sales
Net Sales - COGS = Gross Profit
Gross Profit - Operating Expense - Payroll Expense = Net Profit
Opening Cash + Cash In - Cash Out = Closing Cash
Total Payroll Paid = Payroll Payment Records = Payroll Expense
Sum(branch reports) = Store/Tenant report total
```

### 7.11 Phase F8 — Rollout gate

- ໃຊ້ feature flag ແຍກ `finance_v2`, `expenses`, `payroll`; ເປີດເປັນຂັ້ນຕາມ tenant.
- ກຳນົດ discrepancy threshold, owner sign-off, rollback plan ແລະ backup ກ່ອນ migrate.
- ຈະຖືວ່າພ້ອມ release ເມື່ອ report ໃໝ່ກົງກັບ reconciliation, permission/audit ຄົບ ແລະ E2E/negative/scale tests ຜ່ານ.

## 8. Finance Definition of Done

- [ ] ມີ canonical formula ອັນດຽວ ແລະ P&L ບໍ່ປົນ COGS ກັບ operating expense.
- [ ] Discount, tax, refund, void, date range ແລະ rounding policy ຖືກບັນທຶກແລະທົດສອບ.
- [ ] COGS ຄູນ quantity ທຸກ report; `from/to` ແລະ previous period ຖືກຕ້ອງ.
- [ ] Cash movement enum ກາງຖືກ validate ແລະ cash-in/cash-out ບໍ່ສະຫຼັບ.
- [ ] Expense ledger ມີ CRUD, approval, payment, audit, branch scope ແລະ export.
- [ ] Payroll ມີ compensation, period, calculation, approval, payment, payslip, audit ແລະ adjustment.
- [ ] P&L ລວມ operating expense ແລະ payroll ຄັ້ງດຽວ; payment ບໍ່ຖືກນັບຊ້ຳ.

### 7.10 Payroll authorization ແລະ tax calculation (ປັບປຸງ 2026-08-26)

ລຳດັບການມອບສິດ:

1. Super Admin ສ້າງ/ກຳນົດ role ໃຫ້ Store Owner ແລະມອບ scope ເປັນ store, branch ຫຼື franchise store ທີ່ລະບຸ.
2. Store Owner ສ້າງ role ຫຼືມອບ permission ໃຫ້ Accounting/User ໄດ້ສະເພາະ permission ທີ່ Owner ມີເອງ; level 2 ບໍ່ແມ່ນ wildcard.
3. User ຕ້ອງຜ່ານທັງ permission ແລະ `user_stores` assignment. `payroll:view` ເບິ່ງ, `payroll:compensation` ກຳນົດ compensation/tax profile, `payroll:manage` ສ້າງ-ຄຳນວນ-submit, `payroll:approve` approve, `payroll:pay` ຈ່າຍ.
4. ການ approve/pay ຕ້ອງມີ `canManage` ໃນ store/branch assignment; compensation/manage ຕ້ອງມີ `canWrite` ຫຼື `canManage`. API ກວດ scope ທຸກຄັ້ງ ໂດຍບໍ່ອາໄສການເຊື່ອງປຸ່ມ UI.
5. Whole-store assignment ຄຸ້ມຄອງທຸກ branch ໃນ store ນັ້ນ; branch assignment ເຫັນສະເພາະ branch. Franchise ຕ້ອງມີ store assignment ຂອງ franchise ໂດຍກົງ ແລະບໍ່ຂ້າມ tenant.

Tax flow:

1. Owner/Accounting ທີ່ມີສິດສ້າງ Tax Profile ຕາມ store ຫຼື branch: effective date, progressive brackets, taxable deduction, employee/employer social rate, contribution cap ແລະ source reference.
2. Calculate ເລືອກ profile ຕາມລຳດັບ branch → store/franchise → tenant ແລະ effective date. ຖ້າບໍ່ມີ profile ຈະຕອບ `TAX_PROFILE_REQUIRED`; ບໍ່ຄຳນວນ 0 ອາກອນແບບງຽບ.
3. Payroll item ເກັບ gross, taxable income, income tax, employee social, employer social, other deduction, net, employer cost, profile id ແລະ calculation snapshot.
4. Payroll period/payment ເກັບ tenant/store/branch scope ແລະ actor ເພື່ອ audit ແລະປ້ອງກັນການຈ່າຍຂ້າມ scope.
- [ ] Maker/Checker, self-approval block, tenant/branch isolation ແລະ permission matrix ຖືກກວດຈາກ backend.
- [ ] UI ມີ Finance submenu, calculation basis, status action ແລະບໍ່ເປີດເຜີຍ salary ເກີນ permission.
- [ ] Migration/reconciliation, rollback, unit/API/E2E/negative/scale test ຜ່ານກ່ອນ production.

### 7.12 Branch payroll, OT ແລະ payslip review (ປັບປຸງ 2026-08-26)

1. Payroll period ຕ້ອງລະບຸ `branchId`; ຫ້າມສ້າງ period ລວມທັງ store ເພາະ attendance, OT, maker/checker ແລະ payment scope ຕ້ອງ audit ໄດ້ລະດັບສາຂາ.
2. Compensation ຕ້ອງຜູກ user ກັບ branch ນັ້ນໂດຍ `users.branch_id` ຫຼື branch-specific `user_stores`; Store Owner ສາມາດກຳນົດ compensation ໃຫ້ຕົນເອງໃນ branch ທີ່ຕົນຄຸ້ມຄອງ.
3. Work Policy ຖືກ version ຕາມ branch/effective date ແລະເກັບ standard hours/day, monthly workdays, OT/weekend/holiday multiplier, rounding, max shift hours, weekend days, holiday dates ແລະ source reference. ຖ້າບໍ່ມີ policy ຈະຕອບ `WORK_POLICY_REQUIRED`.
4. Calculate ດຶງສະເພາະ closed shifts ຂອງ user, branch ແລະ inclusive payroll date range ນັ້ນ. Shift ຂອງ branch ອື່ນຈະບໍ່ຖືກລວມ.
5. Daily hours ແຍກ regular, normal OT, weekend ແລະ holiday; hourly rate ຂອງ monthly/daily staff ຖືກ derive ຈາກ Work Policy. `overtimeEligible=false` ບັນທຶກຊົ່ວໂມງແຕ່ບໍ່ເພີ່ມ OT pay.
6. Bonus, commission, additional allowance, reimbursement, unpaid leave, late/absence deduction ແລະ deduction ອື່ນໆໃຊ້ `payroll_adjustments`; maker ສ້າງພ້ອມ reason, checker ອະນຸມັດ ແລະຫ້າມ self-approval. ຖ້າ approve ຫຼັງ Calculate ລະບົບຈະ invalidate draft ແລະບັງຄັບ Calculate ໃໝ່.
7. Payslip preview ສະແດງ attendance days, regular/OT/weekend/holiday hours, base, OT pay, additions, tax, social security, deductions ແລະ net pay ກ່ອນ Submit → Approve → Pay.
8. Calculation snapshot ຕ້ອງເກັບ Tax Profile, Work Policy, source references, hourly rate, shift count, approved adjustments ແລະ tax bracket breakdown ເພື່ອ audit ຍ້ອນຫຼັງ.

### 7.13 Payroll integrity, confidentiality ແລະ calculation flow (ປັບປຸງ 2026-09-02)

1. `payroll:view` ເຫັນຍອດລວມເທົ່ານັ້ນ. ລາຍຊື່ພະນັກງານ, salary, compensation ແລະ payslip ຕ້ອງມີ `payroll:view_detail` ຫຼື workflow permission ທີ່ຈຳເປັນ. `payroll:view_self` ເປີດໜ້າ `/my-payslips` ແລະ API ສົ່ງສະເພາະ item ຂອງ user ທີ່ login.
2. UI ກວດ permission ຄູ່ກັບ store/branch grant ຂອງ payroll period ແຕ່ລະອັນ. ຫ້າມໃຊ້ branch ທີ່ເລືອກຢູ່ອັນດຽວເພື່ອສະແດງ action ຂອງ period ຈາກ branch ອື່ນ.
3. Period creation ໃຊ້ transaction + branch advisory lock ເພື່ອກັນ concurrent overlapping period. Calculate, adjustment review, submit, approve/reject, pay, close ແລະ reverse ໃຊ້ row lock + conditional state transition; payment ໃຊ້ idempotency key.
4. Adjustment lifecycle ຄົບ `PENDING_APPROVAL → APPROVED | REJECTED | CANCELLED`. Checker ຫ້າມ review ລາຍການຂອງຕົນ; maker ຍົກເລີກ pending ຂອງຕົນໄດ້; reject/cancel ຕ້ອງມີ reason ແລະ audit. ການປ່ຽນ adjustment ຫຼັງ calculate ຈະ invalidate draft.
5. Calculate ບໍ່ດຳເນີນຕໍ່ຖ້າມີ attendance `OPEN`. Scheduled day ທີ່ບໍ່ມີ attendance ຖືກສະແດງເປັນ absence review; ລະບົບບໍ່ຫັກ monthly salary ອັດຕະໂນມັດຈົນກວ່າມີ approved deduction/leave decision.
6. Daily wage prorate ຕາມ regular hours. Reimbursement ລວມໃນ payout/employer cost ແຕ່ແຍກຈາກ taxable/social base. Commission ຄຳນວນຈາກ net completed/refunded sales ຂອງ salesperson × compensation commission rate ແລະບວກ approved manual commission/bonus.
7. Work Policy UI ກຳນົດ OT ກາງເວັນ, ຕອນແລງ 17:00–22:00, ກາງຄືນ 22:00–06:00, weekend/holiday bands ແລະ night premium. Shift ຂ້າມຄືນຖືກແຍກຕາມ local date/time band; earned pay ບໍ່ຖືກລຶບເມື່ອ OT ເກີນ limit ແຕ່ສ້າງ compliance warning ສຳລັບ >3h/day, >45h/period ຫຼື >4 ມື້ຕິດກັນ.
8. Compensation/Tax/Work Policy ເປັນ effective-dated. ຫ້າມ backdate ທີ່ overlap active version; ຖ້າມີ version change ກາງ payroll period ຕ້ອງແບ່ງ period ທີ່ effective date ແທນການເລືອກ rate ແບບງຽບ.
9. DB migration `0045_payroll_integrity` ເພີ່ມ currency, reimbursement, scheduled/absence days, review/reject/reversal reasons, commission rate, OT bands, foreign keys, indexes ແລະ status/amount/date constraints.
10. Local HTTP login ຕ້ອງຕັ້ງ refresh cookie ໂດຍບໍ່ມີ `Secure`; HTTPS/proxy HTTPS ຕ້ອງມີ `Secure`. Controller ໃຊ້ `req.secure` (ຮອງຮັບ `trust proxy`) ເພື່ອປ້ອງກັນ refresh page ແລ້ວ logout ໃນ local deployment.

Verification 2026-09-02:

- [x] API TypeScript check, Svelte check, API build ແລະ frontend production build ຜ່ານ.
- [x] API unit/security suite 195 passed, 10 skipped; payroll calculator focused suite 23 passed.
- [x] Migration 0045 ຖືກ apply ໃນ local Postgres; API/Postgres/Redis/RabbitMQ/frontend/nginx healthy.
- [x] Deployed smoke: login 200, refresh cookie ຖືກເກັບໃນ HTTP, refresh success, payroll list/detail/self endpoints ຕອບຖືກຕ້ອງ, unauthenticated payroll = 401.
- [ ] Interactive browser UI/E2E ຕ້ອງຮັນອີກຄັ້ງເມື່ອ browser-control session ພ້ອມ; ຮອບນີ້ runtime ບໍ່ພົບ browser ທີ່ເຊື່ອມຕໍ່.

## 9. Store Owner role delegation and employee schedule flow (2026-08-26)

### 9.1 Role and permission delegation

1. Super Admin ກຳນົດ platform permission catalog ແລະມອບຊຸດສິດທີ່ຈຳກັດໃຫ້ Store Owner.
2. Store Owner ສ້າງ tenant role ໄດ້ເມື່ອມີ `roles:create`.
3. ໜ້າ role editor ຂອງ Store Owner ສະແດງສະເພາະ permission ທີ່ Owner ຖືຢູ່; ສິດ platform ທີ່ຖືກຈຳກັດຈະບອກຈຳນວນແຕ່ເລືອກບໍ່ໄດ້.
4. API ກວດຊ້ຳວ່າ permission ທຸກອັນ active ແລະເປັນ subset ຂອງ caller; crafted request ບໍ່ສາມາດຂ້າມ UI ເພື່ອເພີ່ມສິດ.
5. Custom role ຈຳກັດຢູ່ tenant ແລະຕ້ອງມີ privilege ຕ່ຳກວ່າ caller; store/branch assignment ກວດແຍກອີກຊັ້ນ.

### 9.2 Employee weekly schedule

1. Store Owner ຫຼື manager ທີ່ມີສິດເຂົ້າ Staff ແລະກົດປຸ່ມໂມງຂອງພະນັກງານທີ່ `requiresShift=true`.
2. ກຳນົດວັນເຮັດວຽກ, ເວລາເລີ່ມ, ເວລາເລີກ, timezone ແລະ grace ສຳລັບ branch ທີ່ພະນັກງານຖືກ assign.
3. ການບັນທຶກສ້າງ effective-dated version; version ເກົ່າຖືກປິດແຕ່ບໍ່ລຶບ ເພື່ອໃຫ້ payroll/audit ຄຳນວນປະຫວັດໄດ້.
4. Schedule API ຕ້ອງຜ່ານ `staff:read`/`staff:update`, role ladder, same tenant, branch scope ແລະ employee-to-branch assignment.
5. ພະນັກງານໜຶ່ງຄົນມີ active schedule ໄດ້ສູງສຸດ 1 ອັນຕໍ່ branch/day; DB ກວດ weekday, `HH:mm` ແລະ grace range.

### 9.3 Clock-out enforcement

1. `GET /sales/shifts/current` ສົ່ງ `scheduleStatus`: scheduled end, timezone, remaining minutes ແລະ `canClose`.
2. ກ່ອນເວລາເລີກລົບ grace ປຸ່ມ Clock Out ຖືກ disabled ແລະສະແດງເວລາທີ່ເຫຼືອ.
3. `POST /sales/shifts/:id/close` ຄຳນວນກົດອີກຄັ້ງຢູ່ server; direct API ກ່ອນເວລາຕອບ `409 SHIFT_END_NOT_REACHED`.
4. ຮອງຮັບກະມື້ດຽວ ແລະກະຂ້າມຄືນ. ຖ້າບໍ່ມີ schedule ຈະອະນຸຍາດ flow ເກົ່າ ເພື່ອບໍ່ໃຫ້ user ຕິດຢູ່ open shift.
5. User ປິດໄດ້ສະເພາະ shift ຂອງຕົນ. Manager ທີ່ມີ `staff:update` ປິດ shift ຂອງຄົນອື່ນກ່ອນເວລາໄດ້ສະເພາະມີ override reason ຢ່າງໜ້ອຍ 5 ຕົວ ແລະຖືກ audit.
6. Shift ທີ່ເປີດແລ້ວໃຊ້ schedule version ທີ່ effective ຕອນເປີດ; ການປ່ຽນ schedule ໃໝ່ບໍ່ປ່ຽນພື້ນຖານປະຫວັດ.

### 9.3A Work attendance flow — replaces cash shift as payroll time source (2026-09-01)

1. Work attendance and POS cash shifts are separate domains. `/staff/attendance` records employee work time; `/staff/shifts` opens and closes a cash drawer.
2. Super Admin grants `attendance:clock`, `attendance:view`, and `attendance:manage` to Store Owner. Owner may delegate only permissions they hold to scoped staff roles.
3. `attendance:clock` lets a user clock in/out only for themselves and only in an assigned active branch. The database allows at most one OPEN attendance record per user.
4. Clock-in snapshots the effective employee schedule and calculates raw late minutes. Clock-out is allowed even when early, records early-leave minutes, and calculates actual worked minutes.
5. `attendance:view` lists only records inside the caller's tenant/store/branch scope. `attendance:manage` adds, adjusts, or voids records; every manual mutation requires a reason and creates an immutable audit event.
6. Payroll reads CLOSED/ADJUSTED attendance records. It uses legacy CLOSED cash shifts only when that employee has no attendance record in the historical payroll period, and never mixes both sources.
7. UI CRUD affordances follow permission exactly: read-only users do not see add/edit/void controls. Forms use application dialogs rather than browser `prompt()`/`alert()`.

### 9.3B Payroll policy ownership and payment-button flow (2026-09-02)

1. `payroll:view` ສາມາດເບິ່ງ Tax/Social profile ແລະ Work/OT policy ຂອງ scope ທີ່ໄດ້ຮັບມອບໝາຍໄດ້ແບບ read-only.
2. `payroll:policy` ເປັນສິດແຍກສຳລັບ Store Owner ໃນການສ້າງ effective-dated Tax/Social profile ແລະ Work/OT policy; backend ບັງຄັບທັງ permission ແລະ `canManage` store/branch scope.
3. `payroll:compensation` ໃຊ້ສຳລັບຄ່າແຮງງານພະນັກງານເທົ່ານັ້ນ ແລະບໍ່ອະນຸຍາດໃຫ້ປ່ຽນ Tax/Work policy.
4. Payment button ປາກົດເມື່ອ period ເປັນ `APPROVED` ຫຼື `PARTIALLY_PAID`, caller ມີ `payroll:pay`, ແລະມີ write assignment ສຳລັບ store/branch ຂອງ period. UI ສະແດງເຫດຜົນແທນການເຊື່ອງປຸ່ມແບບບໍ່ມີຄຳອະທິບາຍ.
5. `payroll:approve` ແລະ `payroll:pay` ເປັນ high-risk action permissions ທີ່ Owner ມອບໃຫ້ accountant/checker ໄດ້; action ຈຳກັດຢູ່ write-assigned scope. Close ແລະ reversal ຍັງຕ້ອງ `canManage`.
6. Period flow: Tax/Social profile → Work/OT policy → Compensation → Open period → Calculate → Submit → Checker approve → Pay → Close.
7. Migration `0046_payroll_policy_ownership` ເພີ່ມ permission catalog ແລະຮັກສາການເຂົ້າໃຊ້ຂອງ owner role ລະດັບ 2 ທີ່ມີ payroll compensation ຢູ່ແລ້ວ.

### 9.3C Production receipt and barcode printing flow (2026-09-03)

1. Printer configuration is scoped by tenant/store/branch. The active printer must match both the requested document type (`receipt` or `label`) and the supported transport (`network`). The system must never silently route a receipt to a label printer or a label to a receipt printer.
2. `printing:view`, `printing:receipt`, `printing:label`, `printing:reprint`, and `printing:manage` are separate permissions. Cashiers may print receipts, inventory staff may print labels, and only delegated managers/owners may configure printers or retry jobs.
3. The browser renders Lao-capable receipt/label data, then sends the payload to the API. The API validates payload size, printer ownership/scope, active state, protocol, and private-LAN IP before creating a durable `print_jobs` record.
4. The print job and outbox message are committed in the same database transaction. RabbitMQ delivers the job to a worker, and the worker sends ESC/POS or TSPL bytes to the printer over TCP port 9100 (or the configured port).
5. Job states are `QUEUED -> PROCESSING -> PRINTED` or `FAILED`. Every queue, success, failure, retry, and reprint action is audit logged. The raw payload is retained for retry but never returned by job-history APIs.
6. Receipt auto-print uses a stable idempotency key based on transaction number so browser refresh/retry cannot print duplicate receipts. Manual reprint creates a new auditable job.
7. The POS and barcode pages poll job status and show success/failure. They do not automatically call `window.print()` or WebUSB. Receipt browser/PDF printing remains an explicit user-selected backup button only; barcode PDF remains a separate download action.
8. USB, Bluetooth, serial, and Windows spooler connections are marked as requiring KPOS Print Agent. They cannot be saved or reported as successful until the local signed agent transport is implemented.
9. Security acceptance: reject public IP/hostname targets, cross-tenant printers, out-of-scope branches, wrong document type, inactive printers, malformed/oversized payloads, missing permissions, duplicate automatic jobs, and retry without `printing:reprint`.

### 9.4 Acceptance tests

- Owner catalog ບໍ່ມີ permission ທີ່ Owner ບໍ່ຖື; crafted escalation request ຍັງຕ້ອງໄດ້ 403.
- Owner ສ້າງ role ຈາກ grantable catalog ແລະ assign ໄດ້ສະເພາະ tenant/scope.
- Cross-tenant, cross-branch, higher/equal-role ແລະ unassigned-branch schedule update ຕ້ອງຖືກປະຕິເສດ.
- Same-day pre-end ຖືກ block; end time ສຳເລັດ; grace ຖືກນຳໃຊ້.
- Overnight shift ຖືກ block ກ່ອນ next-day end ແລະສຳເລັດທີ່/ຫຼັງ end.
- ການ replace schedule ຮັກສາ effective-dated row ເກົ່າ ແລະ existing shift ໃຊ້ version ຖືກຕ້ອງ.
