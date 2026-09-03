# KPOS Access Control Flow

ເອກະສານນີ້ກຳນົດ flow ຂອງ Roles, Rules, Permissions ແລະ Maker-Checker ສຳລັບ Super Admin, Store Owner, Branch Admin ແລະ Staff.

## 1. ຫຼັກການຫຼັກ

ລະບົບຈະແຍກໜ້າທີ່ຂອງ Roles, Rules ແລະ Permissions ແຕ່ໃຫ້ເຮັດວຽກຮ່ວມກັນ:

| ສ່ວນ | ຄວາມໝາຍ | ຕົວຢ່າງ |
|---|---|---|
| Permission | ສິດລະອຽດທີ່ API ກວດ | `sales:create`, `sales:delete` |
| Rule | ກຸ່ມການໃຊ້ງານ ແລະ CRUD | Sales, Inventory, Staff |
| Role | ຊຸດຂອງ Permissions + Rules | Store Owner, Branch Admin |
| User Assignment | ການມອບ Role ແລະ workflow ໃຫ້ user | Maker, Checker, Requires Shift |

ຫຼັກການບັງຄັບ:

1. Permission ແມ່ນຕົວກວດຫຼັກຂອງ API.
2. Rule ບໍ່ສາມາດມອບສິດເກີນ Permission ທີ່ Role ມີ.
3. Role ຕ້ອງມີ scope: Global, Tenant ຫຼື Branch.
4. Global system role/rule/permission ຫ້າມ tenant ແກ້ໂດຍກົງ; ຖ້າຕ້ອງການປັບໃຫ້ copy ເປັນ tenant override.
5. ທຸກການປ່ຽນ Role, Rule, Permission ຕ້ອງມີ audit log.
6. ທຸກການກວດສິດຕ້ອງກວດ tenant ແລະ branch scope ກ່ອນອະນຸຍາດ.

## 2. ໂຄງສ້າງອຳນາດ

```text
Super Admin
    │
    ├── Permission Catalog ລະດັບ Platform
    ├── Rule Catalog ລະດັບ Platform
    └── Role Templates ລະດັບ Platform
            │
            ▼
Store Owner / Tenant Admin
    │
    ├── Tenant Roles
    ├── ມອບ Role ໃຫ້ User
    ├── ກຳນົດ Maker / Checker
    └── ກຳນົດ Requires Shift
            │
            ▼
Branch Admin
    │
    ├── Branch Roles
    ├── ຈັດການ Staff ໃນ Branch ຕົນເອງ
    └── ກຳນົດ Maker / Checker ໃນ Scope ຂອງຕົນ
            │
            ▼
Staff / Cashier
    ├── ໃຊ້ງານຕາມ Permission ແລະ Rule
    ├── ເຮັດໜ້າທີ່ Maker ຖ້າຖືກກຳນົດ
    └── ເຮັດໜ້າທີ່ Checker ຖ້າຖືກກຳນົດ
```

## 3. Scope ຂອງແຕ່ລະລະດັບ

| ຜູ້ໃຊ້ | ເຫັນໄດ້ | ສ້າງ/ແກ້ໄດ້ | ສິ່ງທີ່ຫ້າມ |
|---|---|---|---|
| Super Admin | ທຸກ Tenant, Store, Branch | Global catalog, templates ແລະ tenant setup | ບໍ່ມີຂໍ້ຈຳກັດດ້ານ tenant |
| Store Owner | ທຸກ Branch ໃນ Tenant ຕົນເອງ | Tenant role, staff, workflow | ແກ້ Global catalog ໂດຍກົງ |
| Branch Admin | Branch ຕົນເອງ | Branch staff ແລະ branch role | ແກ້ຕ່າງ Branch/tenant ອື່ນ |
| Staff | ຂໍ້ມູນຕາມ Role ແລະ scope | ງານທີ່ຕົນມີ Permission | ຈັດການ Role/Permission |

## 4. Flow 1: Super Admin ສ້າງ Permission

1. Super Admin ເຂົ້າ Platform Access Control.
2. ສ້າງ Permission Group ເຊັ່ນ Sales, Inventory, Staff.
3. ສ້າງ Permission ລະອຽດໃນແຕ່ລະກຸ່ມ:
   - `sales:view`
   - `sales:create`
   - `sales:delete`
   - `inventory:create`
   - `inventory:update`
   - `staff:update`
4. ກວດບໍ່ໃຫ້ Permission key ຊ້ຳ.
5. ກຳນົດ label, module ແລະຄວາມໝາຍ.
6. ບັນທຶກ audit log.
7. Permission ໃໝ່ຈຶ່ງສາມາດນຳໄປໃຊ້ໃນ Rule ແລະ Role template.

ຂໍ້ຫ້າມ: ບໍ່ຄວນໃຊ້ວິທີລຶບ permission ທັງ catalog ແລ້ວສ້າງໃໝ່ທຸກຄັ້ງ. ຄວນ update ເປັນລາຍການ ເພື່ອບໍ່ໃຫ້ Role ເກົ່າເສຍ reference.

## 5. Flow 2: Super Admin ສ້າງ Rule

1. Super Admin ສ້າງ Rule ໃໝ່ ເຊັ່ນ `sales`, `inventory`, `staff`.
2. ກຳນົດ module, route ແລະໜ້າທີ່ຂອງ Rule.
3. ເລືອກ Permission ທີ່ Rule ອ້າງອີງ.
4. ກຳນົດ CRUD:
   - Read: ເບິ່ງຂໍ້ມູນ
   - Create: ສ້າງຂໍ້ມູນ
   - Update: ແກ້ໄຂຂໍ້ມູນ
   - Delete: ລຶບ/ຍົກເລີກຂໍ້ມູນ
5. ກວດວ່າ CRUD ທີ່ເລືອກມີ Permission ຮອງຮັບ.
6. ບັນທຶກ Rule ແລະ audit log.

Rule ເປັນຕົວຈັດກຸ່ມ ແລະຈັດ UI/CRUD; ການຮັບປະກັນ API ຕ້ອງອີງ Permission ເປັນຫຼັກ.

## 6. Flow 3: Super Admin ສ້າງ Role Template

1. Super Admin ເລືອກ Role Template ເຊັ່ນ:
   - Store Owner
   - Branch Admin
   - Branch Manager
   - Cashier
   - Inventory Staff
2. ກຳນົດ Role level.
3. ກຳນົດ Permission ທີ່ Role ຈະຖື.
4. ກຳນົດ Rule ແລະ CRUD matrix.
5. ກວດບໍ່ໃຫ້ Role ມີ Permission ເກີນໜ້າທີ່.
6. ບັນທຶກເປັນ Global system role.
7. Global role ສາມາດຖືກ copy ເປັນ tenant role ໂດຍ Store Owner.

## 7. Flow 4: Super Admin ກຳນົດ Role ໃຫ້ Store Owner

1. Super Admin ອະນຸມັດ Tenant/Store.
2. ເລືອກ Store Owner ຂອງ Tenant.
3. ເລືອກ Global Role Template ທີ່ອະນຸຍາດ.
4. ລະບົບກວດວ່າ Role level ແລະ Permission ຖືກຕ້ອງ.
5. ຜູກ Role ໃຫ້ Store Owner.
6. ລ້າງ auth/menu/permission cache ຂອງ user.
7. ບັນທຶກ audit log.

## 8. Flow 5: Store Owner ປັບ Role ຂອງ Tenant

1. Store Owner ເຂົ້າ Management → Roles.
2. ເຫັນ Global role templates ທີ່ຕົນສາມາດນຳໃຊ້.
3. ຖ້າຕ້ອງການປັບ Global role, ລະບົບສ້າງ Tenant override ອັດຕະໂນມັດ.
4. Store Owner ປັບໄດ້ສະເພາະ Permission ທີ່ຕົນເອງຖື.
5. Store Owner ປັບ Rule/CRUD ສຳລັບ Tenant ຕົນເອງ.
6. ລະບົບຫ້າມປັບ Role level ໃຫ້ສູງກວ່າ Store Owner.
7. ລະບົບຫ້າມສ້າງ permission escalation ເຊັ່ນ `*` ຖ້າ Store Owner ບໍ່ມີ.
8. ບັນທຶກ audit log ແລະ invalidate cache.

## 9. Flow 6: Store Owner ສ້າງ ແລະຈັດການ Staff

1. Store Owner ເຂົ້າ Staff.
2. ສ້າງ user ໃໝ່ ຫຼືເລືອກ user ທີ່ມີຢູ່.
3. ເລືອກ Store ແລະ Branch.
4. ເລືອກ Role ຈາກ Role ທີ່ຢູ່ໃນ scope.
5. ກຳນົດ workflow:
   - Maker: ສາມາດສ້າງລາຍການ
   - Checker: ສາມາດກວດ/ອະນຸມັດ
   - Requires Shift: ຕ້ອງເປີດກະກ່ອນເຮັດວຽກ
6. ລະບົບກວດ Role permission ກ່ອນບັນທຶກ.
7. ລະບົບກວດວ່າ branch ຢູ່ໃນ Tenant ຂອງ Store Owner.
8. ບັນທຶກ user ແລະ invalidate auth cache.

## 10. Flow 7: Store Owner ກຳນົດຕົນເອງເປັນ Maker + Checker

1. Store Owner ເລືອກຊື່ຕົນເອງໃນ Staff.
2. ເປີດ Maker.
3. ເປີດ Checker.
4. ເລືອກ Requires Shift ຕາມນະໂຍບາຍຮ້ານ.
5. ລະບົບອະນຸຍາດໃຫ້ owner ແກ້ workflow ຂອງຕົນເອງ.
6. ການເປັນ Checker ຍັງຕ້ອງມີ approval Permission ທີ່ກ່ຽວຂ້ອງ.
7. ເມື່ອ owner ເປັນ Maker + Checker ສາມາດອະນຸມັດງານຂອງຕົນເອງຕາມ policy ຂອງຮ້ານ.

## 11. Flow 8: Branch Admin ຈັດການ Staff ຂອງຕົນ

1. Branch Admin ເຂົ້າ Staff.
2. ລະບົບສະແດງສະເພາະ user ໃນ Branch ຕົນເອງ.
3. ເລືອກ Role ທີ່ຢູ່ໃນ branch scope.
4. ກຳນົດ Maker, Checker ແລະ Requires Shift ໃຫ້ staff ລະດັບຕ່ຳກວ່າ.
5. ລະບົບຫ້າມ Branch Admin:
   - ແກ້ Store Owner
   - ແກ້ Branch Admin ຄົນອື່ນທີ່ລະດັບທຽບເທົ່າ
   - ແກ້ tenant-wide role
   - ເຂົ້າ branch ອື່ນ
   - ກະທົບ Tenant ອື່ນ
6. ບັນທຶກ audit log.

## 12. Flow 9: Maker ສ້າງລາຍການ

1. User ສົ່ງ request ເພື່ອສ້າງລາຍການ.
2. API ກວດ authentication.
3. API ກວດ tenant ແລະ branch scope.
4. API ກວດ Permission ເຊັ່ນ `sales:create`.
5. API ກວດ `makerEnabled = true`.
6. ຖ້າ `requiresShift = true`, ກວດວ່າ user ມີ OPEN shift.
7. ຖ້າຜ່ານທັງໝົດ ຈຶ່ງສ້າງລາຍການ.
8. ບັນທຶກ `createdBy`/`makerId` ແລະ audit log.

ຖ້າບໍ່ແມ່ນ Maker ໃຫ້ຕອບກັບ `403 MAKER_REQUIRED`.

## 13. Flow 10: Checker ກວດ ແລະອະນຸມັດ

1. Checker ເປີດລາຍການ Pending.
2. API ກວດ authentication ແລະ tenant/branch scope.
3. API ກວດ Permission ທີ່ກ່ຽວຂ້ອງ:
   - Sales void/refund → `sales:delete`
   - Purchase order/transfer → `inventory:update`
   - Stock count → `inventory:adjust`
4. API ກວດ `checkerEnabled = true`.
5. ລະບົບກວດ maker/checker policy ຂອງ Tenant.
6. ຖ້າ policy ຫ້າມ self-approval ແລະມີ Checker ຄົນອື່ນ, Maker ຄົນເກົ່າຈະອະນຸມັດບໍ່ໄດ້.
7. ຖ້າ Store Owner ຖືກກຳນົດເປັນ Maker + Checker, ສາມາດ self-approve ຕາມ policy.
8. ບັນທຶກ `checkedBy`, `approvedAt`, status ແລະ audit log.

ຖ້າບໍ່ແມ່ນ Checker ໃຫ້ຕອບກັບ `403 CHECKER_REQUIRED`.

## 14. Flow 11: ການກັນຂ້າມ Tenant/Branch

ທຸກ request ທີ່ອ້າງອີງ user, role, rule ຫຼື resource ຕ້ອງເຮັດຕາມລຳດັບ:

1. ກວດ user ຍັງ active.
2. ກວດ tenant ID ຂອງ user ກົງກັບ resource.
3. ກວດ branch/store scope.
4. ກວດ role level.
5. ກວດ permission.
6. ກວດ maker/checker flag ຖ້າເປັນ workflow action.
7. ຈຶ່ງອະນຸຍາດໃຫ້ read/write.

ຕົວຢ່າງ:

- Branch Admin ຂອງ Branch A ບໍ່ສາມາດກຳນົດ staff ຂອງ Branch B.
- Store Owner ຂອງ Tenant A ບໍ່ສາມາດເຫັນ user/role ຂອງ Tenant B.
- ການແກ້ Global Role ຈະບໍ່ແກ້ role ຂອງ tenant ອື່ນ.
- Branch role ຂອງ Branch A ບໍ່ສາມາດຖືກນຳໄປໃຊ້ກັບ Branch B.

## 15. Flow 12: ການປ່ຽນ Role/Permission ແລະ Cache

1. Admin ບັນທຶກການປ່ຽນ.
2. API ກວດ permission ceiling ແລະ scope.
3. ບັນທຶກ database transaction.
4. ບັນທຶກ audit log ກ່ອນ/ຫຼັງການປ່ຽນ.
5. Invalidate role permission cache.
6. Invalidate user auth/menu cache ຂອງຜູ້ທີ່ຖື Role.
7. User ເຫັນສິດໃໝ່ໃນການ login/request ຕໍ່ໄປ.

## 16. ແນວທາງໜ້າຈໍ

### Platform Access Control — Super Admin

- Permission Catalog
- Rule Catalog
- Role Templates
- Role levels
- Global audit log

### Tenant Access Control — Store Owner

- My Roles
- Copy Role Template
- Tenant Role Permissions
- Staff Assignment
- Maker/Checker/Shift Settings
- Maker-Checker policy

### Branch Access Control — Branch Admin

- Branch Staff
- Branch Role Assignment
- Maker/Checker/Shift Settings ສຳລັບ staff ໃນ branch

Branch Admin ບໍ່ຄວນເຫັນປຸ່ມແກ້ Permission Catalog ຫຼື Global Rule Catalog.

## 17. ແຜນການພັດທະນາ

### Phase 1: ກຳນົດມາດຕະຖານ

- ກຳນົດຊື່ Permission key ໃຫ້ເປັນມາດຕະຖານ.
- ກຳນົດ Global/Tenant/Branch scope.
- ກຳນົດ role level ແລະ permission ceiling.
- ກຳນົດວ່າ API ໃຊ້ Permission ເປັນ source of truth.

### Phase 2: ລວມ Backend Logic

- ໃຊ້ service ກາງສຳລັບ Role CRUD.
- ຫຼຸດການຊ້ຳກັນຂອງ `/admin/roles` ແລະ `/roles`.
- ຈຳກັດ `/admin/permissions` ໃຫ້ Super Admin.
- ບັງຄັບ tenant/branch scope ໃນທຸກ endpoint.
- ບໍ່ໃຊ້ delete-and-recreate ສຳລັບ permission catalog.

### Phase 3: ປັບ UI ແລະ Menu

- ປ່ຽນຊື່ Admin Roles ເປັນ Platform Role Templates.
- ປ່ຽນ Management Roles ເປັນ Tenant Roles.
- ແຍກ Staff Assignment ອອກຈາກ Role Definition.
- ສະແດງ effective permissions ຂອງ user.
- ສະແດງ scope ຂອງ Role ຢ່າງຊັດເຈນ.

### Phase 4: ທົດສອບຄວາມປອດໄພ

- Tenant A ບໍ່ເຫັນ Tenant B.
- Branch A ບໍ່ແກ້ Branch B.
- Branch Admin ບໍ່ສ້າງ role ລະດັບສູງກວ່າຕົນ.
- Store Owner ບໍ່ແກ້ Global catalog.
- User ມີ Permission ແຕ່ບໍ່ແມ່ນ Maker ສ້າງລາຍການບໍ່ໄດ້.
- User ມີ Permission ແຕ່ບໍ່ແມ່ນ Checker ອະນຸມັດບໍ່ໄດ້.
- Owner ເປັນ Maker + Checker ແລະ self-approve ໄດ້ຕາມ policy.
- Role/permission ທີ່ປ່ຽນໃໝ່ມີຜົນຫຼັງ cache refresh.

## 18. Definition of Done

- Roles, Rules ແລະ Permissions ມີໜ້າທີ່ບໍ່ຊ້ຳກັນ.
- Super Admin ຄຸ້ມຄອງ global catalog ໄດ້.
- Store Owner ຈັດການສະເພາະ tenant ຕົນເອງ.
- Branch Admin ຈັດການສະເພາະ branch ຕົນເອງ.
- Staff ຖືກກຳນົດ Role, Maker, Checker ແລະ Shift ໄດ້.
- API ກວດສິດຈິງ ບໍ່ອີງແຕ່ UI.
- ບໍ່ມີ cross-tenant/cross-branch access.
- ມີ audit log ແລະ cache invalidation.
