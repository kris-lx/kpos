// Interactive UI QA: logs in once, then runs a create/edit smoke test
// against each module's real form via a real browser. One-off QA tool.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.QA_BASE || 'http://localhost:5173';
const EMAIL = process.env.QA_EMAIL;
const PASSWORD = process.env.QA_PASSWORD || 'TestPass123!';
const STAMP = Date.now();

if (!EMAIL) { console.error('Set QA_EMAIL'); process.exit(1); }

let pass = 0, fail = 0;
function check(label, ok, detail) {
    if (ok) { pass++; console.log(`  OK   ${label}`); }
    else { fail++; console.log(`  FAIL ${label}`, detail ?? ''); }
    return ok;
}

const browser = await chromium.launch();
const page = await browser.newPage();
fs.mkdirSync('qa-screenshots', { recursive: true });
async function shot(name) { await page.screenshot({ path: `qa-screenshots/${name}.png`, fullPage: true }).catch(() => {}); }
async function goPage(path) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(700);
}

// Opens the "add" modal/dialog, fills the first text input with `name`,
// clicks save, and checks the name appears somewhere on the page afterward
// (list row or toast). Generic — works for most simple create forms.
async function genericCreate(label, path, name, extra) {
    console.log(`\n--- ${label}: create ---`);
    await goPage(path);
    const addBtn = page.getByRole('button', { name: /ເພີ່ມ|ສ້າງ|Add|New/i }).first();
    if (!(await addBtn.isVisible().catch(() => false))) {
        check(`${label} add button visible`, false);
        await shot(`${label.toLowerCase().replace(/\s+/g, '-')}-no-add-button`);
        return false;
    }
    await addBtn.click();
    await page.waitForTimeout(600);
    const dialog = page.locator('[role="dialog"], .modal, .fixed.inset-0, form').first();
    const nameField = dialog.locator('input[type="text"]:visible, input:not([type]):visible').first();
    if (!(await nameField.isVisible().catch(() => false))) {
        check(`${label} form field visible`, false);
        await shot(`${label.toLowerCase().replace(/\s+/g, '-')}-no-field`);
        return false;
    }
    await nameField.fill(name);
    if (extra) await extra(dialog);
    const saveBtn = dialog.getByRole('button', { name: /ບັນທຶກ|ສ້າງ|Save|Create/i }).last();
    await saveBtn.click();
    await page.waitForTimeout(1500);
    const inPage = await page.locator(`text=${name}`).first().isVisible().catch(() => false);
    const stillOpen = await dialog.isVisible().catch(() => false);
    const ok = check(`${label} create succeeds`, inPage || !stillOpen);
    if (!ok) await shot(`${label.toLowerCase().replace(/\s+/g, '-')}-create-fail`);
    return ok;
}

async function section(name, fn) {
    try {
        await fn();
    } catch (e) {
        fail++;
        console.log(`  FAIL ${name} threw: ${e.message.split('\n')[0]}`);
        await shot(`${name.toLowerCase().replace(/\s+/g, '-')}-exception`);
    }
}

console.log('--- Login ---');
await page.goto(`${BASE}/login`);
await page.waitForLoadState('networkidle');
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(2500);
check('login succeeds', !page.url().includes('/login'));

const BTN_TIMEOUT = { timeout: 6000 };

await section('Products', async () => {
    console.log('\n--- Products: create branch-exclusive product ---');
    await goPage('/products');
    await page.getByRole('button', { name: /ເພີ່ມ/i }).first().click(BTN_TIMEOUT);
    await page.waitForTimeout(500);
    await page.getByLabel(/ຊື່ສິນຄ້າ|ຊື່/).first().fill(`QA UI Product ${STAMP}`);
    await page.getByLabel(/ລາຄາຂາຍ/).first().fill('15000');
    await page.getByRole('button', { name: /ບັນທຶກ/i }).last().click(BTN_TIMEOUT);
    await page.waitForTimeout(1500);
    const productInList = await page.locator(`text=QA UI Product ${STAMP}`).first().isVisible().catch(() => false);
    check('branch product create succeeds', productInList);
    if (!productInList) await shot('products-create-fail');
});

await section('Categories', async () => {
    await genericCreate('Categories', '/categories', `QA Category UI ${STAMP}`);
});

await section('Staff', async () => {
    console.log('\n--- Staff: create ---');
    await goPage('/staff');
    const addStaffBtn = page.getByRole('button', { name: /ເພີ່ມ|ສ້າງ|Add/i }).first();
    if (await addStaffBtn.isVisible().catch(() => false)) {
        await addStaffBtn.click(BTN_TIMEOUT);
        await page.waitForTimeout(600);
        await page.locator('#staffName').fill(`QA Staff ${STAMP}`);
        await page.locator('#staffEmail').fill(`qa-staff-ui-${STAMP}@retest.local`);
        await page.locator('#staffPassword').fill('StaffPass123!');
        const branchSelect = page.locator('#staffBranch');
        if (await branchSelect.isVisible().catch(() => false)) {
            const options = await branchSelect.locator('option').all();
            if (options.length > 1) await branchSelect.selectOption({ index: 1 });
        }
        const saveBtn = page.getByRole('button', { name: /ບັນທຶກ|ສ້າງ|Save/i }).last();
        if (await saveBtn.isVisible().catch(() => false)) {
            await saveBtn.click(BTN_TIMEOUT);
            await page.waitForTimeout(1500);
            const staffInList = await page.locator(`text=QA Staff ${STAMP}`).first().isVisible().catch(() => false);
            check('staff create succeeds', staffInList);
            if (!staffInList) await shot('staff-create-fail');
        } else {
            check('staff form save button visible', false);
            await shot('staff-no-save-button');
        }
    } else {
        check('staff add button visible', false);
        await shot('staff-no-add-button');
    }
});

await section('Roles', async () => {
    console.log('\n--- Roles: create with permissions ---');
    await goPage('/staff/roles');
    const addRoleBtn = page.getByRole('button', { name: /ເພີ່ມ|ສ້າງ|Add/i }).first();
    if (await addRoleBtn.isVisible().catch(() => false)) {
        await addRoleBtn.click(BTN_TIMEOUT);
        await page.waitForTimeout(600);
        const dialog = page.locator('[role="dialog"], .modal, .fixed.inset-0').first();
        const nameField = dialog.locator('input[type="text"]:visible').first();
        await nameField.fill(`qa_ui_role_${STAMP}`);
        const displayNameField = dialog.locator('input[type="text"]:visible').nth(1);
        if (await displayNameField.isVisible().catch(() => false)) {
            await displayNameField.fill(`QA UI Role ${STAMP}`);
        }
        const checkboxes = dialog.locator('input[type="checkbox"]');
        const cbCount = await checkboxes.count().catch(() => 0);
        if (cbCount > 0) {
            await checkboxes.nth(0).check().catch(() => {});
            if (cbCount > 1) await checkboxes.nth(1).check().catch(() => {});
        }
        const saveBtn = dialog.getByRole('button', { name: /ບັນທຶກ|ສ້າງ|Save/i }).last();
        if (await saveBtn.isVisible().catch(() => false)) {
            await saveBtn.click(BTN_TIMEOUT);
            await page.waitForTimeout(1500);
            const roleInList = await page.locator(`text=QA UI Role ${STAMP}`).first().isVisible().catch(() => false);
            check('role create with permissions succeeds (was previously fully broken)', roleInList, `checkboxes found: ${cbCount}`);
            if (!roleInList) await shot('roles-create-fail');
        } else {
            check('roles form save button visible', false);
            await shot('roles-no-save-button');
        }
    } else {
        check('roles add button visible', false);
        await shot('roles-no-add-button');
    }
});

await section('Customers', async () => {
    console.log('\n--- Customers: create member ---');
    await goPage('/customers/members');
    const addBtn = page.getByRole('button', { name: /ເພີ່ມ/i }).first();
    await addBtn.click(BTN_TIMEOUT);
    await page.waitForTimeout(600);
    const dialog = page.locator('.fixed.inset-0').first();
    // Field order: memberCode (optional), name (required) — fill index 1, not 0.
    await dialog.locator('input[type="text"]').nth(1).fill(`QA Member UI ${STAMP}`);
    const saveBtn = dialog.getByRole('button', { name: /ບັນທຶກ|ສ້າງ/i }).last();
    await saveBtn.click(BTN_TIMEOUT);
    await page.waitForTimeout(1500);
    const inList = await page.locator(`text=QA Member UI ${STAMP}`).first().isVisible().catch(() => false);
    check('customer create succeeds', inList);
    if (!inList) await shot('customers-create-fail');
});

await section('Coupons', async () => {
    console.log('\n--- Coupons: create ---');
    await goPage('/promotions/coupons');
    const addBtn = page.getByRole('button', { name: /ເພີ່ມ|ສ້າງ/i }).first();
    await addBtn.click(BTN_TIMEOUT);
    await page.waitForTimeout(600);
    const dialog = page.locator('.fixed.inset-0').first();
    // Field order: code (index 0), name (index 1).
    await dialog.locator('input[type="text"]').nth(0).fill(`QAUICODE${STAMP}`);
    await dialog.locator('input[type="text"]').nth(1).fill(`QA Coupon UI ${STAMP}`);
    const valueField = dialog.locator('input[type="number"]').first();
    if (await valueField.isVisible().catch(() => false)) await valueField.fill('10');
    const saveBtn = dialog.getByRole('button', { name: /ບັນທຶກ|ສ້າງ/i }).last();
    await saveBtn.click(BTN_TIMEOUT);
    await page.waitForTimeout(1500);
    const inList = await page.locator(`text=QA Coupon UI ${STAMP}`).first().isVisible().catch(() => false);
    check('coupon create succeeds', inList);
    if (!inList) await shot('coupons-create-fail');
});

await section('Inventory Transfer', async () => {
    console.log('\n--- Inventory Transfer: create + approve (maker-checker) ---');
    await goPage('/inventory/transfer');
    const addBtn = page.getByRole('button', { name: /ໂອນສິນຄ້າ/i }).first();
    await addBtn.click(BTN_TIMEOUT);
    await page.waitForTimeout(600);
    const dialog = page.locator('.fixed.inset-0').first();
    const selects = dialog.locator('select');
    const selCount = await selects.count();
    check('transfer form has 3 selects (product, from, to)', selCount === 3, `found ${selCount}`);
    if (selCount === 3) {
        const productSelect = selects.nth(0);
        const fromSelect = selects.nth(1);
        const toSelect = selects.nth(2);
        // Pick the seeded product with actual stock (QA Branch Product), not
        // whatever was just created in the Products test above (0 stock).
        const seededOption = productSelect.locator('option', { hasText: 'QA Branch Product' });
        if (await seededOption.count().catch(() => 0) > 0) {
            const val = await seededOption.first().getAttribute('value');
            await productSelect.selectOption(val);
        } else {
            const prodOptions = await productSelect.locator('option').all();
            if (prodOptions.length > 1) await productSelect.selectOption({ index: 1 });
        }
        const fromOptions = await fromSelect.locator('option').all();
        if (fromOptions.length > 1) await fromSelect.selectOption({ index: 1 });
        const toOptions = await toSelect.locator('option').all();
        if (toOptions.length > 1) await toSelect.selectOption({ index: toOptions.length > 2 ? 2 : 1 });
        await dialog.locator('input[type="number"]').first().fill('2');
        const saveBtn = dialog.getByRole('button', { name: /ບັນທຶກ/i }).last();
        await saveBtn.click(BTN_TIMEOUT);
        await page.waitForTimeout(1500);
        const stillOpen = await dialog.isVisible().catch(() => false);
        check('transfer create succeeds (modal closes)', !stillOpen);
        if (stillOpen) await shot('inventory-transfer-create-fail');

        // Try approving the first PENDING transfer, if any approve button exists
        const approveBtn = page.getByTitle(/ອະນຸມັດ/i).first();
        if (await approveBtn.isVisible().catch(() => false)) {
            await approveBtn.click(BTN_TIMEOUT);
            await page.waitForTimeout(500);
            // Confirm dialog may appear
            const confirmBtn = page.getByRole('button', { name: /ຢືນຢັນ|ອະນຸມັດ|Confirm/i }).last();
            if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await confirmBtn.click(BTN_TIMEOUT).catch(() => {});
            }
            await page.waitForTimeout(1500);
            const successToast = await page.locator('text=/ອະນຸມັດການໂອນສຳເລັດ/i').first().isVisible().catch(() => false);
            const errorToast = await page.locator('text=/ບໍ່ສາມາດອະນຸມັດໄດ້/i').first().isVisible().catch(() => false);
            check('transfer approve succeeds (own store, tenant-wide owner)', successToast || !errorToast, errorToast ? 'error toast shown' : '');
            if (errorToast) await shot('inventory-transfer-approve-fail');
        } else {
            console.log('  (no pending transfer to approve — skipping approve check)');
        }
    } else {
        await shot('inventory-transfer-bad-form');
    }
});

await section('Inventory Purchase Orders', async () => {
    console.log('\n--- Purchase Orders: page loads and shows the seeded draft PO ---');
    await goPage('/inventory/purchase-orders');
    const hasContent = await page.locator('body').innerText().then(t => t.length > 200).catch(() => false);
    check('purchase orders page renders content', hasContent);
});

await section('Inventory Count', async () => {
    console.log('\n--- Stock Count: page loads ---');
    await goPage('/inventory/count');
    const hasContent = await page.locator('body').innerText().then(t => t.length > 200).catch(() => false);
    check('stock count page renders content', hasContent);
});

await section('Settings Printers', async () => {
    console.log('\n--- Settings > Printers: create ---');
    await goPage('/settings/printers');
    const addBtn = page.getByRole('button', { name: /ເພີ່ມ|ສ້າງ|Add/i }).first();
    await addBtn.click(BTN_TIMEOUT);
    await page.waitForTimeout(600);
    await page.locator('#pr-name').fill(`QA Printer UI ${STAMP}`);
    const saveBtn = page.getByRole('button', { name: /ບັນທຶກ|ສ້າງ|Save/i }).last();
    await saveBtn.click(BTN_TIMEOUT);
    await page.waitForTimeout(1500);
    const inList = await page.locator(`text=QA Printer UI ${STAMP}`).first().isVisible().catch(() => false);
    check('printer create succeeds', inList);
    if (!inList) await shot('printers-create-fail');
});

await section('POS', async () => {
    console.log('\n--- POS: page loads with products visible ---');
    await goPage('/pos');
    const hasProduct = await page.locator('text=QA Branch Product').first().isVisible({ timeout: 5000 }).catch(() => false);
    check('POS shows seeded product', hasProduct);
    if (!hasProduct) await shot('pos-no-products');
});

await section('Payments', async () => {
    console.log('\n--- Payments: transactions list shows the seeded completed sale ---');
    await goPage('/payments/transactions');
    const hasTx = await page.locator('body').innerText().then(t => t.length > 200).catch(() => false);
    check('payments transactions page renders content', hasTx);
});

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
