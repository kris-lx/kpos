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
    console.log('�️  Deleting all existing data...');

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
    await prisma.stockTransferItem.deleteMany({});
    await prisma.stockTransfer.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.stockCount.deleteMany({});
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
    console.log('   ✓ Promotions deleted');

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

    // Permissions
    await prisma.permission.deleteMany({});
    await prisma.permissionGroup.deleteMany({});
    await prisma.menuPermission.deleteMany({});
    console.log('   ✓ Permissions deleted');

    // Roles
    await prisma.role.deleteMany({});
    console.log('   ✓ Roles deleted');

    // Settings
    await prisma.settings.deleteMany({});
    console.log('   ✓ Settings deleted');

    console.log('\n✅ All data deleted!\n');

    // ═══════════════════════════════════════════════════════════════════════
    // 2. Create Super Admin Role
    // ═══════════════════════════════════════════════════════════════════════
    console.log('📝 Creating Super Admin role...');
    
    const superAdminRole = await prisma.role.create({
        data: {
            name: 'super_admin',
            displayName: 'Super Admin',
            description: 'Full system access - all permissions',
            permissions: ['*'],
            isSystem: true,
        },
    });
    console.log('   ✓ Super Admin role created');

    // ═══════════════════════════════════════════════════════════════════════
    // 3. Create Default Branch
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
    // 4. Create Super Admin User
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
            roleId: superAdminRole.id,
            branchId: mainBranch.id,
            isSuperAdmin: true,
            isActive: true,
            emailVerified: true,
            permissions: ['*'],
        },
    });
    console.log('   ✓ Super Admin user created');

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
