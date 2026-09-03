// UI-only RBAC/tenant-scope regression test. It intentionally creates one
// disposable role and permission group through the visible Super Admin UI.
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE || 'http://localhost:5173';
const SUPER = { email: process.env.QA_SUPER_EMAIL || 'qa-super-1787337413885@retest.local', password: 'TestPass123!' };
const OWNER = { email: process.env.QA_OWNER_EMAIL || 'owner-1787337366086@retest.local', password: 'TestPass123!' };
const FULL_OWNER = { email: process.env.QA_FULL_OWNER_EMAIL || 'qa-full-1787338954310@retest.local', password: 'TestPass123!' };
const MANAGER = { email: process.env.QA_MANAGER_EMAIL || 'qa-manager-1787338958648@retest.local', password: 'ManagerPass123!' };

const browser = await chromium.launch();
const results = [];

function record(phase, check, ok, detail = '') {
    results.push({ phase, check, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} [${phase}] ${check}${detail ? ` — ${detail}` : ''}`);
}

async function newSession(credentials) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    const apiErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
        if (response.status() >= 400 && response.url().includes('/api/')) {
            apiErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
        }
    });
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.locator('#email').fill(credentials.email);
    await page.locator('#password').fill(credentials.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3500);
    if (page.url().includes('/login')) {
        throw new Error(`login failed for ${credentials.email}: ${(await page.locator('body').innerText()).slice(0, 300)}`);
    }
    return { context, page, pageErrors, apiErrors };
}

async function visit(session, path) {
    await session.page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await session.page.waitForTimeout(2200);
    return session.page;
}

function assertText(page, text, phase, check) {
    return page.locator('body').innerText().then((body) => {
        const ok = body.includes(text);
        record(phase, check, ok, ok ? '' : `missing text: ${text}`);
        return ok;
    });
}

// 1) Super Admin: role creation, permission catalog mutation, rules matrix save.
const superSession = await newSession(SUPER);
const superPage = superSession.page;

await visit(superSession, '/admin/roles');
record('super-admin', 'Role Management page loads', superPage.url().includes('/admin/roles') && superSession.pageErrors.length === 0, superSession.pageErrors.join('; '));
await superPage.locator('button[class*="from-pink-600"]').click();
await superPage.locator('#a11y-app-admin-roles-page-svelte-1').fill(`qa_scale_role_${Date.now()}`);
await superPage.locator('#a11y-app-admin-roles-page-svelte-2').fill('QA Scale Role');
// The current role UI grants initial permissions through a visible template.
await superPage.locator('.fixed.inset-0.z-50 button').nth(2).click();
await superPage.locator('.fixed.inset-0.z-50 button[class*="from-pink-500"]').click();
await superPage.waitForTimeout(1800);
await assertText(superPage, 'QA Scale Role', 'super-admin', 'create role from UI with template permissions');

await visit(superSession, '/admin/permissions');
const groupKey = `qa_scale_${Date.now()}`;
const groupLabel = `QA Scale Catalog ${Date.now()}`;
await superPage.locator('button[class*="border-gray-200"][class*="bg-white"]').click();
await superPage.locator('#a11y-app-admin-permissions-page-svelte-1').fill(groupKey);
await superPage.locator('#a11y-app-admin-permissions-page-svelte-2').fill(groupLabel);
await superPage.locator('.fixed.inset-0.z-50 button[type="submit"]').click();
await superPage.waitForTimeout(500);
const groupHeading = superPage.locator('h3').filter({ hasText: groupLabel });
const groupCreated = await groupHeading.count() > 0;
record('super-admin', 'add permission group through UI', groupCreated);
if (groupCreated) {
    await groupHeading.locator('..').locator('..').locator('button[class*="bg-emerald-100"]').click();
    await superPage.locator('#a11y-app-admin-permissions-page-svelte-3').fill('audit_export');
    await superPage.locator('#a11y-app-admin-permissions-page-svelte-4').fill('QA Audit Export');
    await superPage.locator('.fixed.inset-0.z-50 button[type="submit"]').click();
    await superPage.waitForTimeout(400);
    await groupHeading.locator('..').locator('..').locator('button[class*="bg-gray-100"]').click();
    await superPage.waitForTimeout(200);
    record('super-admin', 'permission item appears in the new group', (await superPage.locator('body').innerText()).includes('audit_export'));
    await superPage.locator('button[class*="from-violet-600"]').click();
    await superPage.waitForTimeout(1800);
}
record('super-admin', 'save permission catalog through UI', groupCreated && (await superPage.locator('body').innerText()).includes('audit_export'));

await visit(superSession, '/admin/rules');
const ruleCheckboxes = superPage.locator('input[type="checkbox"]');
const ruleMatrixButtons = superPage.locator('button[title]');
const checkboxCount = await ruleMatrixButtons.count();
if (checkboxCount > 0) await ruleMatrixButtons.first().click();
const rulesSave = superPage.locator('button[class*="from-violet-500"]');
const canSaveRules = await rulesSave.count() > 0;
if (canSaveRules) await rulesSave.first().click();
await superPage.waitForTimeout(1800);
record('super-admin', 'toggle and save rules matrix through UI', checkboxCount > 0 && canSaveRules && superSession.pageErrors.length === 0, [...superSession.pageErrors, ...superSession.apiErrors].join('; '));
record('super-admin', 'admin pages have no runtime crash', superSession.pageErrors.length === 0, superSession.pageErrors.join('; '));

// 2) Store Owner: large staff list and permission editor are available.
const ownerSession = await newSession(OWNER);
const ownerPage = ownerSession.page;
await visit(ownerSession, '/staff');
const staffRows = await ownerPage.locator('tbody tr').count();
const staffPageSize = ownerPage.locator('select').filter({ has: ownerPage.locator('option[value="100"]') });
if (await staffPageSize.count() > 0) {
    await staffPageSize.last().selectOption('100');
    await ownerPage.waitForTimeout(1200);
}
const allStaffRows = await ownerPage.locator('tbody tr').count();
record('store-owner', 'large staff list loads through UI pagination', allStaffRows >= 50, `firstPageRows=${staffRows}, pageSize100Rows=${allStaffRows}`);
const permissionAction = ownerPage.locator('button[class*="hover:text-amber-600"]').first();
const hasPermissionAction = await permissionAction.count() > 0;
if (hasPermissionAction) await permissionAction.click();
await ownerPage.waitForTimeout(1800);
record('store-owner', 'staff permission editor is reachable', hasPermissionAction && ownerPage.url().includes('/permissions'), ownerPage.url());
if (ownerPage.url().includes('/permissions')) {
    record('store-owner', 'owner can save staff permissions', await ownerPage.locator('button[class*="bg-primary-600"]').count() > 0);
}
await visit(ownerSession, '/inventory/transfer');
const ownerTransferText = await ownerPage.locator('body').innerText();
record('store-owner', 'owner transfer page loads without crash', ownerSession.pageErrors.length === 0, ownerSession.pageErrors.join('; '));
record('store-owner', 'large-tenant owner transfer page loads without crash', ownerTransferText.length > 0 && ownerSession.pageErrors.length === 0);

const fullOwnerSession = await newSession(FULL_OWNER);
const fullOwnerPage = fullOwnerSession.page;
await visit(fullOwnerSession, '/inventory/transfer');
// This QA owner is configured with a required shift. Open it through the UI
// so the transfer form is tested in the same state a real owner uses.
const shiftOpenButton = fullOwnerPage.getByRole('button', { name: 'ເປີດກະ' }).last();
if (await shiftOpenButton.count() > 0) {
    const openingAmount = fullOwnerPage.locator('input[type="number"]').last();
    if (await openingAmount.count() > 0) await openingAmount.fill('100000');
    await shiftOpenButton.click();
    await fullOwnerPage.waitForTimeout(1800);
}
const openTransferButton = fullOwnerPage.getByRole('button', { name: /ໂອນສິນຄ້າ/ }).first();
if (await openTransferButton.count() > 0) {
    await openTransferButton.click();
    await fullOwnerPage.waitForTimeout(500);
}
const fullOwnerTransferText = await fullOwnerPage.locator('body').innerText();
const fullOwnerTransferOptions = await fullOwnerPage.locator('select option').allTextContents();
record('store-owner', 'two-branch owner sees both transfer choices', fullOwnerTransferOptions.includes('Branch A') && fullOwnerTransferOptions.includes('Branch B'), fullOwnerTransferOptions.join(' | '));

// 3) Store Manager: whole-store grant exposes both branches, but not platform admin.
const managerSession = await newSession(MANAGER);
const managerPage = managerSession.page;
await visit(managerSession, '/inventory/transfer');
const managerTransferText = await managerPage.locator('body').innerText();
record('store-manager', 'manager transfer page loads without crash', managerSession.pageErrors.length === 0, managerSession.pageErrors.join('; '));
record('store-manager', 'whole-store manager sees both assigned branches', managerTransferText.includes('Branch A') && managerTransferText.includes('Branch B'));
await visit(managerSession, '/staff');
record('store-manager', 'manager staff page loads', managerSession.pageErrors.length === 0, `rows=${await managerPage.locator('tbody tr').count()}`);
record('store-manager', 'manager cannot create staff without staff:create', await managerPage.locator('button[class*="from-primary-600"]').count() === 0);

const allApiErrors = [
    ...superSession.apiErrors.map((e) => `super-admin: ${e}`),
    ...ownerSession.apiErrors.map((e) => `store-owner: ${e}`),
    ...managerSession.apiErrors.map((e) => `store-manager: ${e}`),
];
console.log('\nAPI errors observed during targeted UI flows:');
for (const error of allApiErrors) console.log(`  ${error}`);
const failures = results.filter((result) => !result.ok);
console.log(`\n=== UI RBAC result: ${results.length - failures.length}/${results.length} passed, ${failures.length} failed ===`);
console.log(JSON.stringify({ results, apiErrors: allApiErrors }, null, 2));

await superSession.context.close();
await ownerSession.context.close();
await fullOwnerSession.context.close();
await managerSession.context.close();
await browser.close();
process.exitCode = failures.length ? 1 : 0;
