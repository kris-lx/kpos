// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Database Seed Script
// ລົບຂໍ້ມູນທັງໝົດ ແລະ ສ້າງ Super Admin ໃໝ່
// ═══════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seed...');
    console.log('⚠️  This will DELETE ALL DATA and create fresh Super Admin\n');

    // ═══════════════════════════════════════════════════════════════════════
    // 1. DELETE ALL DATA (in correct order due to relations)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🗑️  Deleting all existing data...');

    // Documents
    await prisma.document.deleteMany({});
    await prisma.documentTemplate.deleteMany({});
    console.log('   ✓ Documents deleted');

    // Transaction related
    await prisma.transactionPayment.deleteMany({});
    await prisma.transactionItem.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.heldSale.deleteMany({});
    console.log('   ✓ Transactions deleted');

    // Order related
    await prisma.orderItem.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.reservation.deleteMany({});
    await prisma.table.deleteMany({});
    console.log('   ✓ Orders & Tables deleted');

    // Shift related
    await prisma.cashMovement.deleteMany({});
    await prisma.shift.deleteMany({});
    await prisma.cashRegister.deleteMany({});
    console.log('   ✓ Shifts deleted');

    // Inventory related
    await prisma.stockCountItem.deleteMany({});
    await prisma.stockCount.deleteMany({});
    await prisma.stockTransferItem.deleteMany({});
    await prisma.stockTransfer.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.inventory.deleteMany({});
    console.log('   ✓ Inventory deleted');

    // Purchase Order related
    await prisma.purchaseOrderItem.deleteMany({});
    await prisma.purchaseOrder.deleteMany({});
    await prisma.vendor.deleteMany({});
    console.log('   ✓ Purchase Orders deleted');

    // Product related
    await prisma.billOfMaterial.deleteMany({});
    await prisma.productPriceLevel.deleteMany({});
    await prisma.sKUVariant.deleteMany({});
    await prisma.productStore.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.priceLevel.deleteMany({});
    console.log('   ✓ Products & Categories deleted');

    // Customer related
    await prisma.pointsHistory.deleteMany({});
    await prisma.customer.deleteMany({});
    console.log('   ✓ Customers deleted');

    // Member related
    await prisma.pointHistory.deleteMany({});
    await prisma.member.deleteMany({});
    await prisma.membershipTier.deleteMany({});
    await prisma.pointSettings.deleteMany({});
    console.log('   ✓ Members deleted');

    // Promotion related
    await prisma.promotion.deleteMany({});
    await prisma.coupon.deleteMany({});
    await prisma.discount.deleteMany({});
    console.log('   ✓ Promotions & Discounts deleted');

    // Settlement
    await prisma.settlement.deleteMany({});
    console.log('   ✓ Settlements deleted');

    // Notifications
    await prisma.notification.deleteMany({});
    console.log('   ✓ Notifications deleted');

    // User related
    await prisma.session.deleteMany({});
    await prisma.activityLog.deleteMany({});
    await prisma.storeRequest.deleteMany({});
    await prisma.userStore.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('   ✓ Users deleted');

    // Store related
    await prisma.store.deleteMany({});
    await prisma.branch.deleteMany({});
    console.log('   ✓ Stores & Branches deleted');

    // Payment methods
    await prisma.paymentMethod.deleteMany({});
    console.log('   ✓ Payment Methods deleted');

    // Permissions (Legacy)
    await prisma.permission.deleteMany({});
    await prisma.permissionGroup.deleteMany({});
    await prisma.menuPermission.deleteMany({});
    console.log('   ✓ Legacy permissions deleted');

    // RBAC Rules & Roles
    await prisma.roleRule.deleteMany({});
    await prisma.rule.deleteMany({});
    await prisma.role.deleteMany({});
    console.log('   ✓ Roles & Rules deleted');

    // Settings
    await prisma.settings.deleteMany({});
    console.log('   ✓ Settings deleted');

    console.log('\n✅ All data deleted!\n');

    // ═══════════════════════════════════════════════════════════════════════
    // 2. Create Roles
    // ═══════════════════════════════════════════════════════════════════════
    console.log('📝 Creating roles...');
    
    const rolesData = [
        { name: 'super_admin', displayName: 'Super Admin', description: 'ຜູ້ບໍລິຫານລະບົບສູງສຸດ', isSystem: true },
        { name: 'admin', displayName: 'Admin', description: 'ຜູ້ບໍລິຫານຮ້ານ', isSystem: true },
        { name: 'store_owner', displayName: 'Store Owner', description: 'ເຈົ້າຂອງຮ້ານ (ລູກຄ້າ)', isSystem: true },
        { name: 'branch_admin', displayName: 'Branch Admin', description: 'ຜູ້ຈັດການສາຂາ', isSystem: true },
        { name: 'store_manager', displayName: 'Store Manager', description: 'ຜູ້ຈັດການຮ້ານຍ່ອຍ', isSystem: true },
        { name: 'cashier', displayName: 'Cashier', description: 'ພະນັກງານຂາຍໜ້າຮ້ານ (POS)', isSystem: true },
        { name: 'inventory_staff', displayName: 'Inventory Staff', description: 'ພະນັກງານສາງ', isSystem: true },
        { name: 'kitchen_staff', displayName: 'Kitchen Staff', description: 'ພະນັກງານຄົວ', isSystem: true },
        { name: 'waiter', displayName: 'Waiter', description: 'ພະນັກງານເສີບ', isSystem: true },
        { name: 'staff', displayName: 'Staff', description: 'ພະນັກງານທົ່ວໄປ', isSystem: true },
    ];

    const rolesMap: Record<string, string> = {};
    for (const r of rolesData) {
        const created = await prisma.role.create({ data: { ...r, permissions: ['*'] } });
        rolesMap[created.name] = created.id;
    }
    console.log(`   ✓ ${rolesData.length} Roles created`);

    // ═══════════════════════════════════════════════════════════════════════
    // 3. Create Rules (RBAC)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🛡️ Creating Rules...');

    const rulesData = [
        { name: "dashboard", displayName: "Dashboard", description: "ໜ້າ Dashboard ຫຼັກ", module: "dashboard", icon: "LayoutDashboard", routes: ["/dashboard"], permissions: ["dashboard:view"], order: 0, isSystem: true },
        { name: "sales", displayName: "ການຂາຍ (POS)", description: "ໜ້າຂາຍ POS, ຂາຍສິນເຊື່ອ, ບິນພັກໄວ້", module: "sales", icon: "ShoppingCart", routes: ["/pos", "/pos/credit", "/pos/held"], permissions: ["sales:view", "sales:create", "sales:update", "sales:delete", "sales:void", "sales:refund", "pos:access", "pos:discount", "pos:void", "pos:credit"], order: 1, isSystem: true },
        { name: "products", displayName: "ການຈັດການສິນຄ້າ", description: "ສິນຄ້າ, ໝວດໝູ່, Barcode, SKU, ລະດັບລາຄາ", module: "products", icon: "Package", routes: ["/products", "/products/sku", "/products/pricing", "/categories", "/barcode"], permissions: ["products:view", "products:create", "products:update", "products:delete", "categories:view", "categories:create", "categories:update", "categories:delete"], order: 2, isSystem: true },
        { name: "inventory", displayName: "ການຈັດການສາງ", description: "ສາງ, ນຳເຂົ້າ/ອອກ, ປັບ, ໂອນ, ກວດນັບ, PO, ຜູ້ສະໜອງ", module: "inventory", icon: "Boxes", routes: ["/inventory", "/inventory/stockin", "/inventory/stockout", "/inventory/adjust", "/inventory/transfer", "/inventory/count", "/inventory/purchase-orders", "/inventory/vendors", "/inventory/expiry", "/inventory/out-of-stock"], permissions: ["inventory:view", "inventory:create", "inventory:update", "inventory:delete", "inventory:transfer", "inventory:adjust", "inventory:stockin", "inventory:stockout"], order: 3, isSystem: true },
        { name: "restaurant", displayName: "ຮ້ານອາຫານ", description: "ໂຕະ, ອໍເດີ, ຄົວ KDS, ຈອງໂຕະ, e-Menu", module: "restaurant", icon: "UtensilsCrossed", routes: ["/restaurant/tables", "/restaurant/orders", "/restaurant/kitchen", "/restaurant/reservations", "/restaurant/e-menu"], permissions: ["restaurant:view", "restaurant:manage", "tables:create", "tables:update", "tables:delete"], order: 4, isSystem: true },
        { name: "promotions", displayName: "ໂປຣໂມຊັ່ນ", description: "ໂປຣໂມຊັ່ນ, ຄູປອງ, ສ່ວນຫຼຸດ", module: "promotions", icon: "Gift", routes: ["/promotions", "/promotions/coupons", "/promotions/discounts"], permissions: ["promotions:view", "promotions:create", "promotions:update", "promotions:delete"], order: 5, isSystem: true },
        { name: "customers", displayName: "ລູກຄ້າ (CRM)", description: "ລູກຄ້າ, ສະມາຊິກ, ຄະແນນ, Loyalty", module: "customers", icon: "Users", routes: ["/customers", "/customers/members", "/customers/points", "/customers/loyalty"], permissions: ["customers:view", "customers:create", "customers:update", "customers:delete"], order: 6, isSystem: true },
        { name: "payments", displayName: "ການຊຳລະ", description: "ວິທີຊຳລະ, ລາຍການ, ປິດບັນຊີ", module: "payments", icon: "Wallet", routes: ["/payments", "/payments/transactions", "/payments/settlements"], permissions: ["payments:view", "payments:create", "payments:void", "payments:settle", "payments:manage"], order: 7, isSystem: true },
        { name: "documents", displayName: "ເອກະສານ", description: "ໃບບິນ, ອອກແບບໃບບິນ, ໃບແຈ້ງໜີ້, ໃບກຳກັບພາສີ", module: "documents", icon: "FileText", routes: ["/documents", "/documents/design", "/documents/invoices", "/documents/tax-invoices"], permissions: ["documents:view", "documents:create", "documents:update", "documents:delete"], order: 8, isSystem: true },
        { name: "reports", displayName: "ລາຍງານ", description: "ລາຍງານການຂາຍ, ສິນຄ້າ, ສາງ, ການເງິນ, ພະນັກງານ, ລູກຄ້າ", module: "reports", icon: "BarChart3", routes: ["/reports", "/reports/products", "/reports/inventory", "/reports/financial", "/reports/staff", "/reports/customers"], permissions: ["reports:view", "reports:sales", "reports:inventory", "reports:financial", "reports:staff"], order: 9, isSystem: true },
        { name: "management", displayName: "ການຈັດການ", description: "ສາຂາ, ຮ້ານ, ພະນັກງານ, ບົດບາດ, ເຄື່ອງ POS, ກະວຽກ", module: "management", icon: "Building2", routes: ["/branches", "/management/stores", "/staff", "/staff/roles", "/management/cashregisters", "/staff/shifts", "/management/shifts", "/my-store", "/store-request"], permissions: ["staff:view", "staff:create", "staff:update", "staff:delete", "roles:view", "roles:create", "roles:update", "roles:delete", "branches:view", "branches:create", "branches:update", "branches:delete", "stores:view", "stores:create", "stores:update", "stores:delete"], order: 10, isSystem: true },
        { name: "settings", displayName: "ຕັ້ງຄ່າ", description: "ຕັ້ງຄ່າທົ່ວໄປ, ຈໍສະແດງ, ໃບບິນ, ພາສີ, ການຊຳລະ, ເຄື່ອງພິມ", module: "settings", icon: "Settings", routes: ["/settings", "/settings/display", "/settings/receipt", "/settings/tax", "/settings/payments", "/settings/printers", "/settings/notifications", "/settings/integrations"], permissions: ["settings:view", "settings:update"], order: 11, isSystem: true },
        { name: "admin", displayName: "Super Admin", description: "ແຜງຄວບຄຸມລະບົບ, ຄຳຂໍເປີດຮ້ານ, ຈັດການທຸກຢ່າງ", module: "admin", icon: "ShieldCheck", routes: ["/admin", "/admin/requests", "/admin/branches", "/admin/users", "/admin/roles", "/admin/rules", "/admin/permissions", "/admin/audit"], permissions: ["*"], order: 12, isSystem: true }
    ];

    const rulesMap: Record<string, string> = {};
    for (const r of rulesData) {
        const created = await prisma.rule.create({ data: { ...r, isActive: true } });
        rulesMap[created.name] = created.id;
    }
    console.log(`   ✓ ${rulesData.length} Rules created`);

    // ═══════════════════════════════════════════════════════════════════════
    // 4. Assign Role Rules (CRUD Matrix)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🔗 Assigning Role Rules...');

    const roleRulesMap: Record<string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>> = {
        super_admin: { dashboard: {r:true,c:true,u:true,d:true}, sales: {r:true,c:true,u:true,d:true}, products: {r:true,c:true,u:true,d:true}, inventory: {r:true,c:true,u:true,d:true}, restaurant: {r:true,c:true,u:true,d:true}, promotions: {r:true,c:true,u:true,d:true}, customers: {r:true,c:true,u:true,d:true}, payments: {r:true,c:true,u:true,d:true}, documents: {r:true,c:true,u:true,d:true}, reports: {r:true,c:true,u:true,d:true}, management: {r:true,c:true,u:true,d:true}, settings: {r:true,c:true,u:true,d:true}, admin: {r:true,c:true,u:true,d:true} },
        admin: { dashboard: {r:true,c:true,u:true,d:true}, sales: {r:true,c:true,u:true,d:true}, products: {r:true,c:true,u:true,d:true}, inventory: {r:true,c:true,u:true,d:true}, restaurant: {r:true,c:true,u:true,d:true}, promotions: {r:true,c:true,u:true,d:true}, customers: {r:true,c:true,u:true,d:true}, payments: {r:true,c:true,u:true,d:true}, documents: {r:true,c:true,u:true,d:true}, reports: {r:true,c:true,u:true,d:true}, management: {r:true,c:true,u:true,d:true}, settings: {r:true,c:true,u:true,d:true} },
        store_owner: { dashboard: {r:true,c:true,u:true,d:true}, sales: {r:true,c:true,u:true,d:true}, products: {r:true,c:true,u:true,d:true}, inventory: {r:true,c:true,u:true,d:true}, restaurant: {r:true,c:true,u:true,d:true}, promotions: {r:true,c:true,u:true,d:true}, customers: {r:true,c:true,u:true,d:true}, payments: {r:true,c:true,u:true,d:true}, documents: {r:true,c:true,u:true,d:true}, reports: {r:true,c:true,u:true,d:true}, management: {r:true,c:true,u:true,d:true}, settings: {r:true,c:true,u:true,d:true} },
        branch_admin: { dashboard: {r:true,c:false,u:false,d:false}, sales: {r:true,c:true,u:true,d:false}, products: {r:true,c:true,u:true,d:false}, inventory: {r:true,c:true,u:true,d:false}, restaurant: {r:true,c:true,u:true,d:false}, promotions: {r:true,c:true,u:false,d:false}, customers: {r:true,c:true,u:true,d:false}, payments: {r:true,c:true,u:false,d:false}, documents: {r:true,c:true,u:false,d:false}, reports: {r:true,c:false,u:false,d:false}, management: {r:true,c:true,u:true,d:false}, settings: {r:true,c:false,u:true,d:false} },
        store_manager: { dashboard: {r:true,c:false,u:false,d:false}, sales: {r:true,c:true,u:true,d:false}, products: {r:true,c:true,u:true,d:false}, inventory: {r:true,c:true,u:true,d:false}, promotions: {r:true,c:true,u:false,d:false}, customers: {r:true,c:true,u:true,d:false}, payments: {r:true,c:true,u:false,d:false}, documents: {r:true,c:true,u:false,d:false}, reports: {r:true,c:false,u:false,d:false}, management: {r:true,c:true,u:true,d:false}, settings: {r:true,c:false,u:false,d:false} },
        cashier: { dashboard: {r:true,c:false,u:false,d:false}, sales: {r:true,c:true,u:false,d:false}, products: {r:true,c:false,u:false,d:false}, customers: {r:true,c:false,u:false,d:false}, payments: {r:true,c:true,u:false,d:false}, documents: {r:true,c:false,u:false,d:false} },
        inventory_staff: { dashboard: {r:true,c:false,u:false,d:false}, products: {r:true,c:false,u:false,d:false}, inventory: {r:true,c:true,u:true,d:false}, reports: {r:true,c:false,u:false,d:false} },
        kitchen_staff: { restaurant: {r:true,c:true,u:true,d:false} },
        waiter: { restaurant: {r:true,c:true,u:true,d:false}, sales: {r:true,c:true,u:false,d:false} },
    };

    let roleRuleCount = 0;
    for (const [roleName, rules] of Object.entries(roleRulesMap)) {
        const roleId = rolesMap[roleName];
        if (!roleId) continue;

        for (const [ruleName, crud] of Object.entries(rules)) {
            const ruleId = rulesMap[ruleName];
            if (!ruleId) continue;

            await prisma.roleRule.create({
                data: {
                    roleId,
                    ruleId,
                    canRead: crud.r,
                    canCreate: crud.c,
                    canUpdate: crud.u,
                    canDelete: crud.d,
                }
            });
            roleRuleCount++;
        }
    }
    console.log(`   ✓ ${roleRuleCount} RoleRule mappings created`);

    // ═══════════════════════════════════════════════════════════════════════
    // 5. Create Default Branch
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🏢 Creating default branch...');
    
    const mainBranch = await prisma.branch.create({
        data: {
            name: 'ສຳນັກງານໃຫຍ່',
            code: 'HQ',
            address: 'ນະຄອນຫຼວງວຽງຈັນ',
            phone: '+856 20 1234 5678',
            email: 'hq@kpos.la',
            isActive: true,
            isMain: true,
            settings: {
                currency: 'LAK',
                timezone: 'Asia/Vientiane',
            },
        },
    });
    console.log('   ✓ Default branch created');

    // ═══════════════════════════════════════════════════════════════════════
    // 6. Create Default Store
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🏪 Creating default store...');

    const mainStore = await prisma.store.create({
        data: {
            name: 'ຮ້ານຫຼັກ',
            code: 'MAIN',
            branchId: mainBranch.id,
            address: 'ນະຄອນຫຼວງວຽງຈັນ',
            phone: '+856 20 1234 5678',
            email: 'main@kpos.la',
            isActive: true,
            isDefault: true,
            settings: {
                currency: 'LAK',
                taxRate: 7,
            },
        },
    });
    console.log('   ✓ Default store created');

    // ═══════════════════════════════════════════════════════════════════════
    // 7. Create Super Admin User
    // ═══════════════════════════════════════════════════════════════════════
    console.log('👤 Creating Super Admin user...');
    
    const hashedPassword = await argon2.hash('admin123');
    
    const superAdmin = await prisma.user.create({
        data: {
            email: 'admin@kpos.la',
            password: hashedPassword,
            name: 'Super Admin',
            phone: '+856 20 0000 0000',
            role: 'super_admin',
            roleId: rolesMap['super_admin'],
            branchId: mainBranch.id,
            isSuperAdmin: true,
            isActive: true,
            emailVerified: true,
            permissions: ['*'],
        },
    });
    console.log('   ✓ Super Admin user created');

    // ═══════════════════════════════════════════════════════════════════════
    // 8. Assign Store Access to Super Admin
    // ═══════════════════════════════════════════════════════════════════════
    console.log('🔑 Assigning store access to Super Admin...');

    await prisma.userStore.create({
        data: {
            userId: superAdmin.id,
            storeId: mainStore.id,
            branchId: mainBranch.id,
            isDefault: true,
            canRead: true,
            canWrite: true,
            canDelete: true,
            canManage: true,
        },
    });
    console.log('   ✓ Store access assigned');

    // ═══════════════════════════════════════════════════════════════════════
    // 9. Create Default Payment Methods
    // ═══════════════════════════════════════════════════════════════════════
    console.log('💳 Creating payment methods...');

    await prisma.paymentMethod.createMany({
        data: [
            { name: 'ເງິນສົດ', code: 'CASH', type: 'CASH', isActive: true, isDefault: true, sortOrder: 1 },
            { name: 'ບັດ', code: 'CARD', type: 'CARD', isActive: true, isDefault: false, sortOrder: 2 },
            { name: 'QR Code', code: 'QR', type: 'QR', isActive: true, isDefault: false, sortOrder: 3 },
            { name: 'ໂອນເງິນ', code: 'TRANSFER', type: 'TRANSFER', isActive: true, isDefault: false, sortOrder: 4 },
        ],
    });
    console.log('   ✓ Payment methods created (Cash, Card, QR, Transfer)');

    // ═══════════════════════════════════════════════════════════════════════
    // 10. Create Default Category
    // ═══════════════════════════════════════════════════════════════════════
    console.log('📂 Creating default category...');

    await prisma.category.create({
        data: {
            name: 'ທົ່ວໄປ',
            slug: 'general',
            description: 'ໝວດໝູ່ທົ່ວໄປ',
            isActive: true,
            sortOrder: 1,
        },
    });
    console.log('   ✓ Default category created');

    // ═══════════════════════════════════════════════════════════════════════
    // Done!
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n╔═══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                      🎉 Seed completed successfully!                      ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════════╣');
    console.log('║  Super Admin Login:                                                       ║');
    console.log('║  ─────────────────────────────────────────────────────────────────────── ║');
    console.log('║  Email:    admin@kpos.la                                                 ║');
    console.log('║  Password: admin123                                                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

