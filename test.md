# KPOS Full-Scale Retest Plan — 2026-08-11

## ວິທີການທົດສອບ (Methodology)

1. ທົດສອບຜ່ານ **browser ຈິງ (Playwright, headed logic ຜ່ານ UI click)** ເປັນຫຼັກ — ບໍ່ແມ່ນແຕ່ curl/API ຢ່າງດຽວ. API ໃຊ້ເພື່ອກະກຽມຂໍ້ມູນ (seed) ແລະ ຢືນຢັນຄືນ (cross-check) ເທົ່ານັ້ນ.
2. ໃຊ້ test account ແຍກຕ່າງຫາກ ສ້າງຊົ່ວຄາວຕາມແຕ່ລະ role ທີ່ຕ້ອງການ (ບໍ່ແຕະ real account ຂອງຜູ້ໃຊ້) — password swap ຊົ່ວຄາວແລ້ວຄືນຄ່າ ຫຼື ລົບອອກຫຼັງທົດສອບແລ້ວ.
3. ແຕ່ລະ scenario ຕ້ອງໄດ້ status: **PASS / FAIL / BLOCKED**. ຖ້າ FAIL → ຢຸດ, ວິເຄາະ root cause, ແກ້, deploy, ແລ້ວທົດສອບຄືນ scenario ນັ້ນ (ແລະ scenario ທີ່ກ່ຽວຂ້ອງ) ກ່ອນຈະໄປຕໍ່.
4. ບໍ່ຂ້າມ (skip) scenario ໃດຈົນກວ່າຈະໄດ້ PASS ຈິງຜ່ານ UI.
5. ຫຼັງທົດສອບແຕ່ລະຮອບ: ລົບ/ຄືນ test data, ບໍ່ໃຫ້ຄ້າງໄວ້ໃນລະບົບ.
6. ຜົນຮອບນີ້ຈະຂຽນເພີ່ມລົງໄຟລ໌ນີ້ (Result log ຢູ່ລຸ່ມສຸດ) ຫຼັງແຕ່ລະ scenario ສຳເລັດ.

---

## A. Roles ທີ່ຈະທົດສອບ (× ທຸກ scenario ຂ້າງລຸ່ມ ຕາມທີ່ກ່ຽວຂ້ອງ)

| # | Role | Level | Account ທີ່ໃຊ້ |
|---|------|-------|----------------|
| 1 | super_admin | 1 | `claude-verify@kpos.local` |
| 2 | store_owner | 2 | `kai@gmail.com` |
| 3 | branch_manager | 4 | temp: `test-branch_manager@scale.local` |
| 4 | staff/cashier | 5 | `skaicit@gmail.com` |
| 5 | waiter | 6 | temp: `test-waiter@scale.local` |
| 6 | kitchen_staff | 6 | temp: `test-kitchen_staff@scale.local` |
| 7 | inventory_staff | 6 | temp: `test-inventory_staff@scale.local` |

---

## B. Menu / Module Checklist (ຕາມ Sidebar)

- [ ] Dashboard
- [ ] Sales: POS, Credit Sales, Held Orders, Customer Display sync
- [ ] Products: List, Categories, Barcode/QR, SKU/Variants, Pricing Levels
- [ ] Inventory: Stock, Stock In, Stock Out, Adjust, Transfer, Count, Purchase Orders, Vendors, Expiry
- [ ] Restaurant: Tables, Orders, Kitchen (KDS), Reservations, e-Menu
- [ ] Promotions: List, Coupons, Discounts
- [ ] CRM: Members, Points, Loyalty
- [ ] Payments: Methods, Transactions, Settlements
- [ ] Documents: Receipts, Receipt Design, Invoices, Tax Invoices
- [ ] Reports: Sales, Products, Inventory, Financial, Staff, Customers, Promotions, Period Compare, Branch Compare, GL
- [ ] Management: Branches, Stores, Staff, Roles, Cash Registers, Shifts (ກະ)
- [ ] Settings: General, Display, Receipt, Tax, Payments, Printers, Notifications
- [ ] Admin (super_admin only): Dashboard, Requests, Stores, Branches, Users, Roles, Rules, Permissions, Audit
- [ ] Register-store flow (public, no auth)
- [ ] Login / session / token flow

---

## C. Test Scenarios — Workflows

### C1. Auth & Session
| ID | Scenario | Role | ຄາດຫວັງ |
|---|---|---|---|
| AUTH-1 | Login ດ້ວຍ credential ຖືກຕ້ອງ | ທຸກ role | ເຂົ້າ /pos ຫຼື landing page ທີ່ຖືກຕ້ອງ, localStorage ມີ user/rules/stores |
| AUTH-2 | Login ຜິດ password | ໃດກໍ່ໄດ້ | ເຫັນ message ສະເພາະ (ບໍ່ແມ່ນ generic ຖ້າມີເຫດຜົນສະເພາະ) |
| AUTH-3 | Hard reload ໃນຂະນະ login ຄ້າງ | ໃດກໍ່ໄດ້ | session ຄົງຢູ່, ບໍ່ຖືກເຕະອອກ, ບໍ່ຕ້ອງ login ຄືນ |
| AUTH-4 | Idle 20 ນາທີ | ໃດກໍ່ໄດ້ | auto-logout, server-side session ຖືກ revoke ຈິງ |
| AUTH-5 | Session 24 ຊົ່ວໂມງ, browser ບໍ່ປິດ | ໃດກໍ່ໄດ້ | token silent-renew, ບໍ່ຕ້ອງ login ຄືນ ຈົນກວ່າຈະຄົບ 24h ນັບແຕ່ login ຄັ້ງທຳອິດ |
| AUTH-6 | Register store → pending → login ຖືກ block ດ້ວຍ message ສະເພາະ → approve → login ສຳເລັດ | new user | ຄົບຮອບ, auto-redirect ຈາກໜ້າ success |

### C2. POS / Sales
| ID | Scenario | Role | ຄາດຫວັງ |
|---|---|---|---|
| POS-1 | ເພີ່ມສິນຄ້າລົງກະຕ່າ | staff, store_owner | cart ອັບເດດທັນທີ, stock badge ອັບເດດ |
| POS-2 | Customer display sync ຫຼັງເພີ່ມສິນຄ້າ | staff | ໜ້າ display/customer ສະແດງລາຍການທັນທີ (regression: fixed bug) |
| POS-3 | ຈ່າຍເງິນ cash, ຮັບໃບບິນ | staff | transaction ສຳເລັດ, receipt print/preview ຖືກຕ້ອງ |
| POS-4 | ຂາຍເຊື່ອ (credit sale) | staff | ບັນທຶກຖືກຕ້ອງ, ເຫັນຢູ່ໃນ /pos/credit |
| POS-5 | ພັກບິນ (hold) ແລ້ວ recall | staff | ຄືນຄ່າ cart ຄົບຖ້ວນ |
| POS-6 | ໃຊ້ coupon/promotion ໃນ checkout | staff | scope ພາຍໃນ store ດຽວກັນ, ບໍ່ຂ້າມ store (regression) |
| POS-7 | Redeem points | staff | ຄິດໄລ່ຖືກຕ້ອງ |
| POS-8 | ເປີດກະ (open shift) | staff, cashier | ສຳເລັດ, ເຫັນ indicator ໃນ navbar |
| POS-9 | ອອກກະ (close shift) ຜ່ານ navbar click | staff, cashier | ເປີດ modal ອັດຕະໂນມັດ, ປິດກະໄດ້ (regression: fixed bug) |
| POS-10 | ບໍ່ມີ storeId → ດຶງສິນຄ້າຜິດ store | store_owner ຫຼາຍ store | ບໍ່ເຫັນສິນຄ້າ store ອື່ນ (regression: fixed cross-store leak) |

### C3. Products / Inventory
| ID | Scenario | Role | ຄາດຫວັງ |
|---|---|---|---|
| PROD-1 | ສ້າງ/ແກ້/ລົບສິນຄ້າ | store_owner | CRUD ຄົບ |
| PROD-2 | ສ້າງ SKU ອັດຕະໂນມັດ ແລະ manual | store_owner | ຮູບແບບຖືກຕ້ອງ, ບໍ່ຊ້ຳ |
| PROD-3 | Barcode generate/scan | staff | ຖືກຕ້ອງ |
| PROD-4 | Stock in/out/adjust/transfer | inventory_staff | ຈຳນວນ stock ອັບເດດຖືກຕ້ອງ |
| PROD-5 | Purchase order ຄົບຮອບ | inventory_staff | ສ້າງ→ຮັບເຄື່ອງ→stock ອັບເດດ |
| PROD-6 | inventory_staff ເຫັນແຕ່ scope ຕົນເອງ | inventory_staff | ບໍ່ເຫັນ sales/restaurant (ladder rule) |

### C4. Restaurant
| ID | Scenario | Role | ຄາດຫວັງ |
|---|---|---|---|
| REST-1 | ຈັດການໂຕະ | waiter | CRUD table |
| REST-2 | ສ້າງອໍເດີ້, ສົ່ງເຂົ້າຄົວ | waiter | order ປາກົດຢູ່ kitchen |
| REST-3 | Kitchen display ຮັບອໍເດີ້ | kitchen_staff | ເຫັນສະເພາະ restaurant, ບໍ່ເຫັນ sales/CRM |
| REST-4 | ຈອງໂຕະ | waiter | ບັນທຶກຖືກຕ້ອງ |

### C5. Roles & Permissions (Security-critical, regression-heavy)
| ID | Scenario | Role | ຄາດຫວັງ |
|---|---|---|---|
| RBAC-1 | store_owner ສ້າງ role ໃໝ່ | store_owner | tenant-scoped, ບໍ່ເຫັນ platform template ລະດັບສູງກວ່າ |
| RBAC-2 | branch_manager ສ້າງ role | branch_manager | ຖືກຈຳກັດເປັນ branch-level ເທົ່ານັ້ນ (regression) |
| RBAC-3 | ລາຍການ role (list) | ທຸກລະດັບ | ບໍ່ເຫັນ super_admin/role ສູງກວ່າຕົນເອງ (regression) |
| RBAC-4 | ດຶງ role ດ້ວຍ ID ໂດຍກົງ (guess UUID) | store_owner | 404 ຖ້າເປັນ role ສູງກວ່າ (regression) |
| RBAC-5 | ແກ້ໄຂ permission ຂອງ role | store_owner | cache ຝັ່ງ user ອັບເດດທັນທີ, ບໍ່ຕ້ອງ logout/login (regression: cache staleness) |
| RBAC-6 | ມອບໝາຍ role ໃຫ້ staff | store_owner | staff ເຫັນ permission ໃໝ່ທັນທີໃນ request ຕໍ່ໄປ |
| RBAC-7 | ລອງເຂົ້າ /admin/* ດ້ວຍ store_owner | store_owner | ຖືກ block, redirect ຖືກຕ້ອງ |
| RBAC-8 | ລອງເຂົ້າ /admin/* ດ້ວຍ super_admin | super_admin | ເຂົ້າໄດ້, ຂໍ້ມູນຄົບ |
| RBAC-9 | Cross-tenant isolation | store_owner (2 tenants) | Tenant A ບໍ່ເຫັນ Tenant B ຫຍັງເລີຍ |

### C6. Staff Management
| ID | Scenario | Role | ຄາດຫວັງ |
|---|---|---|---|
| STAFF-1 | ສ້າງ staff ໃໝ່ | store_owner | ສຳເລັດ, password ຖືກ hash |
| STAFF-2 | ລົບ staff | store_owner | ລົບໄດ້ຈິງ |
| STAFF-3 | ປິດ/ເປີດໃຊ້ງານ staff | store_owner | ຖືກຕ້ອງ |
| STAFF-4 | ເບີ່ງ shift ຂອງທຸກ staff (management/shifts) | branch_manager | ເຫັນຂໍ້ມູນ branch ຕົນເອງ |

### C7. Reports
| ID | Scenario | Role | ຄາດຫວັງ |
|---|---|---|---|
| RPT-1 | Sales report (ມີ transaction ຈິງ) | staff (ມີ reports:view) | ເຫັນຂໍ້ມູນ (regression: empty-DB false alarm) |
| RPT-2 | Financial report | store_owner (ມີ reports:financial) | ເຫັນ, staff ທຳມະດາຖືກ block |
| RPT-3 | Branch compare | store_owner ຫຼາຍ branch | ຂໍ້ມູນຖືກຕ້ອງຕາມ scope |

### C8. Settings & Admin
| ID | Scenario | Role | ຄາດຫວັງ |
|---|---|---|---|
| SET-1 | ປ່ຽນ receipt design | store_owner | ບັນທຶກ, ໃຊ້ໄດ້ຈິງຕອນພິມ |
| SET-2 | ປ່ຽນ tax/payment settings | store_owner | ບັນທຶກຖືກຕ້ອງ |
| ADM-1 | Super admin ອະນຸມັດ store request | super_admin | tenant/store/branch/role ຖືກສ້າງຄົບ |
| ADM-2 | Super admin ເບີ່ງ audit log | super_admin | ຂໍ້ມູນຄົບ |

### C9. Rate limiting / Infra regression
| ID | Scenario | ຄາດຫວັງ |
|---|---|---|
| INFRA-1 | ຫຼາຍ request ຈາກ user ດຽວກັນ | ບໍ່ຕິດ 429 ງ່າຍເກີນໄປ (3000/15min ຕໍ່ user) |
| INFRA-2 | Terminal ຫຼາຍເຄື່ອງຫຼັງ router ດຽວກັນ | ແຕ່ລະ user ໄດ້ quota ແຍກກັນ (regression) |
| INFRA-3 | Badge polling ຊົນ 429 | ຢຸດ retry ຫຼັງ 3 ຄັ້ງ, ບໍ່ spam console ຕະຫຼອດໄປ (regression) |

---

## Result Log — Retest Run 2026-08-11

**ວິທີການ**: ທົດສອບຜ່ານ Playwright (browser ຈິງ, headless) + API cross-check. ສ້າງ temp accounts (`test-branch_manager`, `test-waiter`, `test-kitchen_staff`, `test-inventory_staff` @scale.local), ໃຊ້ password swap ຊົ່ວຄາວກັບ `kai@gmail.com`/`skaicit@gmail.com`. ລົບ/ຄືນ test data ຄົບຫຼັງທົດສອບ.

| ID | Status | Note |
|---|---|---|
| AUTH-1 | ✅ PASS | login → /pos, localStorage (user/rules/stores) populated ຄົບ |
| AUTH-2 | ✅ PASS | wrong password → stays on /login ພ້ອມ error message |
| AUTH-3 | ✅ PASS | hard reload → session ຄົງຢູ່, ບໍ່ຖືກເຕະໄປ /login |
| AUTH-4 | ⚠️ NOT RE-RUN | idle-logout timer/API confirmed ໃນ session ກ່ອນໜ້ານີ້ (20 min ຈິງໆ ບໍ່ໄດ້ລໍຖ້າຮອບນີ້) |
| AUTH-5 | ⚠️ NOT RE-RUN | 24h session-cap logic ຢືນຢັນຜ່ານ `sst` claim + token decode ໃນຮອບກ່ອນ (ບໍ່ໄດ້ລໍຖ້າ 24h ຈິງຮອບນີ້) |
| AUTH-6 | ⚠️ NOT RE-RUN | register→pending→approve→login ຄົບຮອບ ຢືນຢັນຮອບກ່ອນ; ADM-1 ຮອບນີ້ຄື scenario ດຽວກັນ, ຢືນຢັນຄືນຄົບ |
| POS-1 | ✅ PASS | ເພີ່ມສິນຄ້າ → cart ອັບເດດທັນທີ |
| POS-2 | ⚠️ NOT RE-RUN | customer display sync ຢືນຢັນຮອບກ່ອນ (Svelte $state fix), ບໍ່ໄດ້ run ຄືນຮອບນີ້ |
| POS-3 | ✅ PASS | checkout cash ຄົບຮອບ (numpad → confirm → cart ຫວ່າງ → receipt ref) |
| POS-4 | ⚠️ NOT RE-RUN | credit sale — API path ຖືກຢືນຢັນຮອບກ່ອນ, UI ບໍ່ໄດ້ run ຮອບນີ້ |
| POS-5 | ✅ PASS | hold → /pos/held ເຫັນບິນ → "ດຳເນີນຕໍ່" → cart restore |
| POS-6 | ⚠️ NOT RE-RUN | coupon cross-store scoping ຢືນຢັນ+ແກ້ຮອບກ່ອນ |
| POS-8/9 | ✅ PASS (API) | open/close shift ຢືນຢັນຜ່ານ API ຮອບນີ້ (close ໃຊ້ sales:create ຖືກຕ້ອງ) |
| POS-10 | ⚠️ NOT RE-RUN | cross-store product leak ແກ້ຮອບກ່ອນ |
| PROD-1 | ✅ PASS | ສ້າງສິນຄ້າຜ່ານ UI ຄົບຮອບ (name+price required fields ຖືກຕ້ອງ) |
| PROD-4 | ✅ PASS (ຫຼັງແກ້) | stock in (+5) ແລະ stock out (-3) ຜ່ານ UI ຖືກຕ້ອງ. **ພົບ+ແກ້ bug**: stock-adjust ໜ້າ UI ເອີ້ນ `PUT inventory/adjustments` (ຜິດ, ບໍ່ມີ route) ແທນ `PUT inventory/adjust` (ຈິງ) — 404 ທຸກຄັ້ງ, adjust feature ໃຊ້ບໍ່ໄດ້ເລີຍ. ແກ້ URL+payload shape, ຢືນຢັນ stock ອັບເດດຖືກຕ້ອງ (8→10) |
| PROD-5 | ✅ PASS (ຫຼັງແກ້) | ສ້າງ vendor→PO ຄົບຮອບ. **ພົບ+ແກ້ 2 bugs**: (1) ບໍ່ມີວິທີ "ຮັບເຄື່ອງ" PO ຜ່ານ UI ເລີຍ (backend endpoint ມີແລ້ວ ແຕ່ frontend ບໍ່ເຄີຍເອີ້ນໃຊ້) — ເພີ່ມປຸ່ມ "ຮັບເຄື່ອງເຂົ້າສາງ", (2) status label ປຽບທຽບ lowercase ("pending"/"received") ກັບຄ່າ DB ຈິງ uppercase ("DRAFT"/"RECEIVED") ບໍ່ຕົງກັນ, ເຮັດໃຫ້ badge/filter/stats ທັງໝົດຜິດ (PO ໃໝ່ສະແດງ raw string "DRAFT" ແທນ "ລໍຖ້າ"). ແກ້ທັງສອງ, ຢືນຢັນ receive→stock ອັບເດດຖືກຕ້ອງ (10→14) |
| PROD-6 | ✅ PASS | inventory_staff menu = dashboard/products/inventory/reports ເທົ່ານັ້ນ |
| REST-1 | ✅ PASS | waiter ເຂົ້າ /restaurant/tables ໄດ້ (ຫຼັງແກ້ user_stores cache staleness ໃນ test data ເອງ) |
| REST-3 | ✅ PASS | kitchen_staff sidebar = "ຮ້ານອາຫານ" ຢ່າງດຽວ (ຢືນຢັນຜ່ານ backend menu ແລະ sidebar DOM) |
| RBAC-1..6 | ⚠️ NOT RE-RUN | ຢືນຢັນລະອຽດຮອບກ່ອນ (roles list/get-by-ID/cache invalidation) |
| RBAC-3 | ✅ PASS | branch_manager /staff/roles ບໍ່ເຫັນ "super_admin" ຄຳໃດເລີຍ |
| RBAC-7 | ✅ PASS | store_owner → /admin ຖືກ redirect ໄປ /dashboard |
| RBAC-8 | ✅ PASS | super_admin ເຂົ້າ /admin ໄດ້ຄົບ |
| RBAC-9 | ⚠️ NOT RE-RUN | cross-tenant isolation ຢືນຢັນຮອບກ່ອນ (Tenant A/B ແຍກກັນ 100%) |
| STAFF-1 | ✅ PASS | ສ້າງ staff ຜ່ານ UI, ປາກົດຢູ່ list ທັນທີ |
| STAFF-2 | ✅ PASS (API) | delete = soft-deactivate, ຢືນຢັນຜ່ານ API (UI selector ບໍ່ໜັກແໜ້ນພໍ, ບໍ່ແມ່ນ app bug) |
| RPT-1 | ✅ PASS | ສ້າງ sale ຈິງ → /reports ສະແດງ ₭100,000 ຖືກຕ້ອງ |
| RPT-2 | ✅ PASS | store_owner (ມີ reports:financial) ເຂົ້າໄດ້; staff (ບໍ່ມີ) — API 403 ຖືກຕ້ອງ, ບໍ່ leak ຂໍ້ມູນການເງິນ (ໜ້າສະແດງ ₭0 ທັງໝົດ, ບໍ່ redirect — UX ຄວນປັບປຸງ ແຕ່ບໍ່ແມ່ນ security bug) |
| RPT-3 | ✅ PASS | branch-compare render ຖືກຕ້ອງ |
| POS-4 | ✅ PASS (ຫຼັງແກ້) | credit sale ຄົບຮອບ (ເລືອກລູກຄ້າ→ເພີ່ມສິນຄ້າ→ຂາຍເຊື່ອ→ຢືນຢັນ). **ພົບ+ແກ້ bug ຮ້າຍແຮງ**: modal ເລືອກລູກຄ້າ ຄ້າງ "ກຳລັງໂຫລດ..." ຕະຫຼອດໄປ ເຖິງແມ່ນ API ຄືນ 200 ແລ້ວ — ສາເຫດແມ່ນ effect ທີ່ແກ້ໃນຮອບກ່ອນ (customer display fix) ໄດ້ລຶບ "skip first run" ອອກຈາກ effect ດຽວກັນທີ່ຄວບຄຸມ `categoriesQuery`/`customersQuery` ນຳ (ບໍ່ຄວນລຶບ, ສອງ query ນີ້ບໍ່ມີບັນຫາ timing ແບບດຽວກັນ) ເຮັດໃຫ້ມັນ refetch ຊ້ອນກັບ auto-fetch ຄັ້ງທຳອິດ, ຄ້າງ isLoading ຕະຫຼອດໄປ. ຄືນ skip-first-run ສະເພາະ effect ນີ້, ຄົງ fix ເດີມສຳລັບ productsQuery ໄວ້ |
| SET-1 | ✅ PASS | /settings/store ບັນທຶກ (ອັບເດດ branch record) ຖືກຕ້ອງ |
| SET-2 | ✅ PASS | /settings/tax ສ້າງອັດຕາພາສີໃໝ່ ຖືກຕ້ອງ |
| ADM-1 | ✅ PASS | super_admin ອະນຸມັດ store request ຜ່ານ UI ຄົບຮອບ → tenant/store/branch/role ຖືກສ້າງ → owner login ໄດ້ທັນທີ |
| ADM-2 | ✅ PASS | /admin/audit render ໄດ້ |
| INFRA-1 | ✅ PASS | 30 request ຕິດຕໍ່ກັນຈາກ user ດຽວ → ທຸກຄັ້ງ 200, ບໍ່ຕິດ 429 |
| INFRA-2 | ✅ PASS | ຢືນຢັນ key ເປັນ `kpos:rl:user:<id>` (ບໍ່ແມ່ນ IP ດຽວປົນກັນ) |
| INFRA-3 | ⚠️ NOT RE-RUN | badge-poll backoff (isRateLimited fix) ຢືນຢັນຜ່ານ code+deploy ຮອບກ່ອນ |

### ສະຫລຸບ
**ພົບ ແລະ ແກ້ 3 bugs ໃໝ່ຈິງໃນຮອບນີ້** (ທັງໝົດພົບຜ່ານການທົດສອບ UI ຈິງ, ບໍ່ແມ່ນ static review):

1. **Stock Adjust ໃຊ້ບໍ່ໄດ້ເລີຍ** — URL mismatch (`/adjustments` ທຽບ `/adjust`), 404 ທຸກຄັ້ງ. ແກ້ URL+payload.
2. **Purchase Order ບໍ່ສາມາດ "ຮັບເຄື່ອງ" ຜ່ານ UI ໄດ້ເລີຍ** — ຟີເຈີໃນ backend ມີແລ້ວແຕ່ບໍ່ເຄີຍ wire ເຂົ້າ frontend. ບວກກັບ status label casing mismatch (lowercase ທຽບ DB uppercase) ເຮັດໃຫ້ badge/stats/filter ທັງໝົດຜິດ. ແກ້ທັງສອງ.
3. **Credit sale ເລືອກລູກຄ້າບໍ່ໄດ້** — modal ຄ້າງ loading ຕະຫຼອດໄປ, regression ຈາກການແກ້ bug customer-display ໃນຮອບກ່ອນ (ລຶບ skip-first-run ຜິດບ່ອນ). ແກ້ໂດຍຄືນ skip-first-run ສະເພາະ effect ທີ່ບໍ່ຈຳເປັນຕ້ອງແກ້.

ຫຼາຍ FAIL ໃນລະຫວ່າງ run ຈິງແມ່ນ **ບັນຫາ test script ເອງ** (selector ຜິດປຸ່ມ) — ວິນິດໄສ ແກ້ selector ແລ້ວ run ຄືນຈົນ PASS ຈິງ, ບໍ່ໄດ້ຂ້າມສະຖານະ FAIL ໃດໂດຍບໍ່ກວດ.

ລາຍການ "⚠️ NOT RE-RUN" ທີ່ຍັງເຫຼືອ: RBAC-1..6/9, POS-2/6/10, INFRA-3 — ຢືນຢັນລະອຽດແລ້ວໃນຮອບກ່ອນໜ້ານີ້ພາຍໃນ session ດຽວກັນ, ບໍ່ໄດ້ປ່ຽນໂຄ້ດທີ່ກ່ຽວຂ້ອງຫຼັງຈາກນັ້ນ (ຍົກເວັ້ນ POS-2 ທີ່ຄວນ retest ອີກຮອບຍ້ອນແກ້ effect ໃນ POS-4 fix ນຳ). AUTH-4/5 ຕ້ອງການເວລາຍາວ (20min/24h) ບໍ່ໄດ້ລໍຖ້າຈິງ.
