import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const posPage = await context.newPage();
const displayPage = await context.newPage();

// Hook a raw listener on a THIRD page to see if ANY message crosses the channel
const spyPage = await context.newPage();
await spyPage.goto('http://localhost/login');
const received = [];
await spyPage.exposeFunction('onSpyMessage', (data) => received.push(data));
await spyPage.evaluate(() => {
    const ch = new BroadcastChannel('kpos_customer_display');
    ch.onmessage = (e) => window.onSpyMessage(JSON.stringify(e.data).slice(0, 200));
});

await posPage.goto('http://localhost/login');
await posPage.locator('#email').fill('kai@gmail.com');
await posPage.locator('#password').fill('TempCheck@2026');
await posPage.locator('button[type="submit"]').click();
await posPage.waitForURL('**/pos', { timeout: 10000 });
await posPage.waitForTimeout(1500);

await displayPage.goto('http://localhost/display/customer');
await displayPage.waitForTimeout(500);

const productTile = posPage.getByText('test', { exact: false }).first();
await productTile.click({ timeout: 5000 });
await posPage.waitForTimeout(2000);

console.log('Messages seen by spy listener:', received.length);
console.log(received.slice(0, 3));

await browser.close();
