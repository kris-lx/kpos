// Automated QA crawl: logs in, visits every app page, and records console
// errors + failed (4xx/5xx) network requests per page. Screenshots go to
// qa-screenshots/. One-off QA tool, not part of the e2e suite.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.QA_BASE || 'http://localhost:5000';
const EMAIL = process.env.QA_EMAIL;
const PASSWORD = process.env.QA_PASSWORD || 'TestPass123!';

if (!EMAIL) {
    console.error('Set QA_EMAIL env var');
    process.exit(1);
}

const PAGES = [
    '/dashboard', '/pos', '/pos/credit', '/pos/held',
    '/products', '/products/pricing', '/products/sku', '/categories',
    '/inventory', '/inventory/adjust', '/inventory/count', '/inventory/expiry',
    '/inventory/out-of-stock', '/inventory/purchase-orders', '/inventory/stockin',
    '/inventory/stockout', '/inventory/transfer', '/inventory/vendors',
    '/customers', '/customers/loyalty', '/customers/members', '/customers/points',
    '/staff', '/staff/roles', '/staff/shifts',
    '/payments', '/payments/settlements', '/payments/transactions',
    '/reports', '/reports/branch-compare', '/reports/customers', '/reports/financial',
    '/reports/gl', '/reports/inventory', '/reports/period-compare', '/reports/products',
    '/reports/promotions', '/reports/staff',
    '/promotions', '/promotions/coupons', '/promotions/discounts',
    '/documents', '/documents/design', '/documents/invoices', '/documents/tax-invoices',
    '/settings', '/settings/backup', '/settings/display', '/settings/documents',
    '/settings/integrations', '/settings/loyalty', '/settings/notifications',
    '/settings/payments', '/settings/printers', '/settings/profile', '/settings/receipt',
    '/settings/store', '/settings/tax',
    '/branches', '/my-store', '/notifications', '/barcode',
    '/management', '/management/cashregisters', '/management/roles', '/management/shifts',
    '/restaurant', '/restaurant/e-menu', '/restaurant/kitchen', '/restaurant/orders',
    '/restaurant/reservations', '/restaurant/tables',
    '/admin', '/admin/audit', '/admin/branches', '/admin/enums', '/admin/permissions',
    '/admin/positions', '/admin/requests', '/admin/roles', '/admin/rules',
    '/admin/stores', '/admin/users',
    '/help',
].slice(Number(process.env.QA_SKIP || 0));

const browser = await chromium.launch();
const page = await browser.newPage();

const results = [];

page.on('console', (msg) => {
    if (msg.type() === 'error') {
        page._qaConsoleErrors = page._qaConsoleErrors || [];
        page._qaConsoleErrors.push(msg.text());
    }
});
page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('/api/')) {
        page._qaFailedRequests = page._qaFailedRequests || [];
        page._qaFailedRequests.push(`${res.status()} ${res.request().method()} ${res.url().replace(BASE, '')}`);
    }
});
page.on('pageerror', (err) => {
    page._qaPageErrors = page._qaPageErrors || [];
    page._qaPageErrors.push(err.message);
});

console.log('--- Logging in ---');
await page.goto(`${BASE}/login`);
await page.waitForLoadState('networkidle');
await page.locator('#email').fill(EMAIL);
await page.locator('#password').fill(PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(8000);
if (page.url().includes('/login')) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    console.error('LOGIN FAILED, aborting. URL:', page.url());
    console.error('Page text:', bodyText.slice(0, 500));
    await browser.close();
    process.exit(1);
}
console.log('Logged in, landed at:', page.url());

fs.mkdirSync('qa-screenshots', { recursive: true });

for (const path of PAGES) {
    page._qaConsoleErrors = [];
    page._qaFailedRequests = [];
    page._qaPageErrors = [];
    let navError = null;
    try {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    } catch (e) {
        navError = e.message;
    }
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const looksCrashed = /application error|unexpected error|500|something went wrong/i.test(bodyText) && bodyText.length < 500;
    const finalUrl = page.url();
    const redirected = !finalUrl.includes(path) && path !== '/dashboard';

    const entry = {
        path,
        finalUrl: finalUrl.replace(BASE, ''),
        navError,
        looksCrashed,
        consoleErrors: page._qaConsoleErrors,
        pageErrors: page._qaPageErrors,
        failedRequests: page._qaFailedRequests,
    };
    results.push(entry);

    const problem = navError || looksCrashed || page._qaPageErrors.length > 0 || page._qaFailedRequests.length > 0;
    console.log(`${problem ? 'FAIL' : 'OK  '} ${path}${redirected ? ` -> ${entry.finalUrl}` : ''}`);
    if (problem) {
        if (navError) console.log(`      nav error: ${navError}`);
        if (looksCrashed) console.log(`      page looks crashed`);
        for (const e of page._qaPageErrors) console.log(`      page error: ${e}`);
        for (const e of page._qaFailedRequests) console.log(`      failed req: ${e}`);
        const shotName = path.replace(/\//g, '_') || '_root';
        await page.screenshot({ path: `qa-screenshots/${shotName}.png`, fullPage: true }).catch(() => {});
    }
}

fs.writeFileSync('qa-crawl-results.json', JSON.stringify(results, null, 2));
const failCount = results.filter(r => r.navError || r.looksCrashed || r.pageErrors.length > 0 || r.failedRequests.length > 0).length;
console.log(`\n=== ${results.length - failCount}/${results.length} pages OK, ${failCount} with issues ===`);

await browser.close();
