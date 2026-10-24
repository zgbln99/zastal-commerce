// Browser E2E against tests/e2e/serve.py. Run: node tests/e2e/checkout.e2e.mjs <config-json>
import { createRequire } from 'node:module';
// Playwright may be installed globally (CI image) or locally; resolve either way.
const requireFrom = createRequire(process.env.PLAYWRIGHT_ROOT ? process.env.PLAYWRIGHT_ROOT + '/' : import.meta.url);
const { chromium } = requireFrom('playwright');
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const config = JSON.parse(process.argv[2] || '{}');
const WEB = config.web || 'http://127.0.0.1:8878';
const API = config.api || 'http://127.0.0.1:8880';
const OUT = process.env.E2E_OUT || '.qa/e2e';
mkdirSync(OUT, { recursive: true });
const results = [];
const step = (name, ok, note = '') => { results.push({ name, ok, note }); console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`); };
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

async function fillCheckout(page, { email, name, delivery, payment, address = true }) {
  await page.fill('input[type="email"]', email);
  await page.fill('input[autocomplete="name"]', name);
  await page.check(`input[name="delivery"][value="${delivery}"]`);
  if (address) {
    await page.fill('input[autocomplete="address-line1"]', 'ul. Zielona 5');
    await page.fill('input[autocomplete="postal-code"]', '65-001');
    await page.fill('input[autocomplete="address-level2"]', 'Zielona Góra');
  }
  await page.check(`input[name="payment"][value="${payment}"]`);
  const consents = page.locator('.checkout-summary .consent-row input[type="checkbox"]');
  await consents.nth(0).check();
  await consents.nth(1).check();
}

const browser = await chromium.launch();
try {
  // ---------- Mobile customer journey: product → cart → checkout (transfer) → receipt
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pl-PL' });
  const page = await mobile.newPage();
  await page.goto(WEB + '/', { waitUntil: 'networkidle' });
  await shot(page, '01-home-390');
  await page.goto(WEB + '/produkt/9', { waitUntil: 'networkidle' });
  step('mobile: preorder product shows note and size guide', (await page.locator('.product-preorder-note').count()) === 1 && (await page.locator('.product-size-guide').count()) === 1);
  await shot(page, '02a-product-preorder-390');
  await page.goto(WEB + '/produkt/3', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'M', exact: true }).click();
  await shot(page, '02-product-390');
  await page.getByRole('button', { name: 'Dodaj do koszyka' }).click();
  await page.waitForSelector('.cart-modal');
  await shot(page, '03-cart-390');
  step('mobile: product added to cart', await page.locator('.cart-item').count() === 1);
  await page.getByRole('button', { name: /Przejdź do zamówienia/ }).click();
  await page.waitForURL('**/zamowienie');
  await page.waitForSelector('input[type="email"]');
  await fillCheckout(page, { email: 'kibic@example.test', name: 'Jan Kibic', delivery: 'kurier', payment: 'transfer' });
  await shot(page, '04-checkout-390');
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().endsWith('/api/orders') && r.request().method() === 'POST'),
    page.getByRole('button', { name: /Zamawiam z obowiązkiem zapłaty/ }).click(),
  ]);
  const created = await response.json();
  step('mobile: transfer order created', response.status() === 201 && created.status === 'oczekuje_platnosci', `ZS-${created.id}`);
  await page.waitForURL('**/zamowienie?id=*');
  await page.waitForSelector('.receipt-success');
  const receiptText = await page.locator('.receipt-page').innerText();
  step('mobile: receipt shows transfer instructions', receiptText.includes('Dane do przelewu') && receiptText.includes(`ZASTAL ZS-${String(created.id).padStart(5, '0')}`));
  step('mobile: receipt has no demo wording', !/testow|demo/i.test(receiptText));
  await shot(page, '05-receipt-transfer-390');
  // Validation: missing consents and bad postal code are caught client-side
  await page.goto(WEB + '/produkt/8', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Dodaj do koszyka' }).first().click();
  await page.waitForSelector('.cart-modal');
  await page.getByRole('button', { name: /Przejdź do zamówienia/ }).click();
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', 'niepoprawny');
  await page.check('input[name="delivery"][value="paczkomat"]');
  await page.getByRole('button', { name: /Zamawiam/ }).click();
  const errors = await page.locator('.field-error').count();
  step('mobile: client validation blocks invalid submission', errors >= 3, `${errors} field errors`);
  await shot(page, '06-checkout-validation-390');
  await mobile.close();

  // ---------- Desktop journey with PayU: redirect, signed notification, paid receipt
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pl-PL' });
  const d = await desktop.newPage();
  // The fake PayU host answers with a stub page so the redirect can be observed.
  await d.route('https://payu.example.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>PayU sandbox (stub)</h1>' }));
  await d.goto(WEB + '/sklep', { waitUntil: 'networkidle' });
  await shot(d, '07-shop-1440');
  await d.goto(WEB + '/produkt/1', { waitUntil: 'networkidle' });
  await d.getByRole('button', { name: 'L', exact: true }).click();
  await d.getByRole('button', { name: 'Własny nadruk' }).click();
  await d.fill('input[placeholder="np. KOWALSKI"]', 'Kibic');
  await d.fill('input[placeholder="0–99"]', '7');
  await d.waitForSelector('.print-preview-photo img');
  const previewText = await d.locator('.print-preview-photo svg').innerHTML();
  step('desktop: print preview renders name and number on the product photo', previewText.includes('KIBIC') && previewText.includes('>7<'));
  await shot(d, '08-product-personalized-1440');
  await d.getByRole('button', { name: 'Dodaj do koszyka' }).click();
  await d.waitForSelector('.cart-modal');
  await d.getByRole('button', { name: /Przejdź do zamówienia/ }).click();
  await d.waitForSelector('input[type="email"]');
  await fillCheckout(d, { email: 'online@example.test', name: 'Anna Nowak', delivery: 'odbior', payment: 'payu', address: false });
  await shot(d, '09-checkout-payu-1440');
  // The page redirects to PayU immediately, so capture the reply inside the request route.
  let payuOrder = null, payuStatus = 0;
  await d.route('**/api/orders', async route => { const reply = await route.fetch(); payuStatus = reply.status(); payuOrder = await reply.json(); await route.fulfill({ response: reply }); });
  await d.getByRole('button', { name: /Zamawiam i płacę/ }).click();
  await d.waitForURL(/payu-fake=/);
  await d.unroute('**/api/orders');
  step('desktop: PayU order created with redirect', payuStatus === 201 && payuOrder?.payment?.redirect_url?.includes('payu-fake='), payuOrder?.payment?.redirect_url);
  const ext = new URL(d.url()).searchParams.get('payu-fake');
  // Simulate PayU's server-to-server notification with the real signature scheme.
  const body = JSON.stringify({ order: { orderId: 'PAYU-' + ext, extOrderId: ext, status: 'COMPLETED', totalAmount: String(payuOrder.total), currencyCode: 'PLN' } });
  const signature = createHash('md5').update(body + config.payu_second_key).digest('hex');
  const notify = await fetch(API + '/api/payments/payu/notify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'OpenPayu-Signature': `sender=checkout;signature=${signature};algorithm=MD5;content=DOCUMENT` }, body });
  const notified = await notify.json();
  step('desktop: signed PayU notification accepted', notify.status === 200 && notified.result === 'completed', notified.result);
  await d.goto(`${WEB}/zamowienie?id=${payuOrder.id}&token=${encodeURIComponent(payuOrder.tracking_token)}&payment=return`, { waitUntil: 'networkidle' });
  await d.waitForSelector('.receipt-success');
  const paidText = await d.locator('.receipt-page').innerText();
  step('desktop: receipt shows paid status and print snapshot', paidText.includes('Płatność przyjęta') && paidText.includes('KIBIC') && paidText.includes('Opłacone'));
  await shot(d, '10-receipt-paid-1440');

  // ---------- Staff panel: login, sales settings, order payment panel, fulfillment queue
  await d.goto(WEB + '/admin', { waitUntil: 'networkidle' });
  await d.fill('input[autocomplete="username"]', 'admin');
  await d.fill('input[autocomplete="current-password"]', config.admin_password);
  await d.getByRole('button', { name: 'Zaloguj się' }).click();
  await d.waitForSelector('.admin-shell', { timeout: 15000 });
  step('admin: login over session cookie works', true);
  await shot(d, '11-admin-dashboard-1440');
  await d.locator('.admin-navitem', { hasText: 'Sprzedaż i dostawy' }).first().click();
  await d.waitForSelector('.sales-settings .sales-checks');
  const checks = await d.locator('.sales-checks li.ok').count();
  step('admin: readiness shows live mode with all checks', (await d.locator('.sales-mode.live').count()) === 1 && checks === 10, `${checks}/10`);
  await shot(d, '12-admin-sales-settings-1440');
  await d.locator('.admin-navitem', { hasText: 'Zamówienia' }).first().click();
  await d.waitForSelector('.ops-orders-table');
  await d.getByRole('button', { name: `Otwórz ZS-${String(created.id).padStart(5, '0')}` }).click();
  await d.waitForSelector('.ops-order-commerce');
  await shot(d, '13-admin-order-transfer-1440');
  await d.fill('input[aria-label="Notatka do płatności"]', 'wyciąg 24.10');
  await d.getByRole('button', { name: 'Potwierdź wpłatę' }).click();
  await d.waitForSelector('.ops-success');
  await d.waitForFunction(() => document.querySelector('#order-status-select')?.value === 'oplacone');
  step('admin: transfer confirmed moves order to opłacone', true);
  await shot(d, '14-admin-order-paid-1440');
  await d.keyboard.press('Escape');
  await d.locator('.admin-navitem', { hasText: 'Realizacja' }).first().click();
  await d.waitForSelector('.fulfillment-orders button');
  const queuedText = (await d.locator('.fulfillment-orders button').allInnerTexts()).join(' ');
  const expected = [created.id, payuOrder.id].map(id => `ZS-${String(id).padStart(5, '0')}`);
  step('admin: paid orders are in the fulfillment queue', expected.every(number => queuedText.includes(number)), expected.join(', '));
  await shot(d, '15-admin-fulfillment-1440');
  await d.locator('.admin-navitem', { hasText: 'Produkty' }).first().click();
  await d.waitForSelector('.admin-product-table tbody tr');
  await d.locator('.admin-product-table tbody tr', { hasText: 'Bluza Zastal Logo' }).getByRole('button', { name: 'Edytuj' }).click();
  await d.waitForSelector('.admin-print-layout-stage .print-preview-stage img');
  step('admin: product editor shows the draggable print layout', (await d.locator('.admin-print-layout-stage rect').count()) === 2);
  await shot(d, '16a-admin-product-layout-1440');
  await d.keyboard.press('Escape');
  await d.locator('.admin-navitem', { hasText: 'Pracownicy' }).first().click();
  await d.waitForSelector('.admin-roles-grid');
  await shot(d, '16-admin-staff-1440');
  // Cashier sees only its screens
  await d.getByRole('button', { name: 'Wyloguj' }).click();
  await d.waitForSelector('input[autocomplete="username"]');
  await d.fill('input[autocomplete="username"]', 'kasa');
  await d.fill('input[autocomplete="current-password"]', config.staff_password);
  await d.getByRole('button', { name: 'Zaloguj się' }).click();
  await d.waitForSelector('.admin-shell');
  const navItems = await d.locator('.admin-navitem').allInnerTexts();
  step('admin: cashier navigation is limited by capabilities', navItems.includes('Kasa POS') && !navItems.includes('Edytor strony') && !navItems.includes('Pracownicy'), navItems.join(', '));
  await shot(d, '17-admin-cashier-1440');
  // Cashier: open a shift, record a live counter sale with a fiscal receipt number, close the shift with a report
  await d.setViewportSize({ width: 1024, height: 768 });
  d.on('dialog', dialog => dialog.accept());
  await d.locator('.admin-navitem', { hasText: 'Kasa POS' }).first().click();
  await d.waitForSelector('.pos-shift.closed');
  await d.fill('.pos-shift-open input', '200');
  await d.getByRole('button', { name: 'Otwórz zmianę' }).click();
  await d.waitForSelector('.pos-shift.open');
  step('pos: cashier opened a shift with opening cash', (await d.locator('.pos-shift-stats').innerText()).includes('200,00'));
  await d.locator('.pos-product', { hasText: 'Worek sportowy' }).click();
  await d.locator('.pos-size-buttons button').first().click();
  await d.getByRole('button', { name: 'Dodaj 1 sztukę' }).click();
  await d.fill('input[placeholder="np. 2026/10/000123"]', '2026/10/000777');
  await d.fill('.pos-payment input[inputmode="decimal"]', '100');
  await d.locator('.pos-payment .pos-confirm input').last().check();
  await shot(d, '18-admin-pos-1024');
  await d.getByRole('button', { name: 'Zapisz sprzedaż', exact: true }).click();
  await d.waitForSelector('.staff-sale-receipt');
  const receiptDoc = await d.locator('.staff-sale-receipt').innerText();
  step('pos: live sale recorded with fiscal receipt reference and change', receiptDoc.includes('potwierdzenie sprzedaży') && receiptDoc.includes('paragon nr 2026/10/000777') && receiptDoc.includes('reszta 50,00'), receiptDoc.split('\n')[1]);
  await shot(d, '19-admin-pos-receipt-1024');
  await d.getByRole('button', { name: 'Zamknij zmianę' }).click();
  await d.fill('.pos-shift-close input[inputmode="decimal"]', '250');
  await d.getByRole('button', { name: 'Zapisz zamknięcie i raport' }).click();
  await d.waitForSelector('.pos-shift-report');
  const report = await d.locator('.pos-shift-report').innerText();
  step('pos: shift closed with expected-vs-counted report', report.includes('oczekiwana 250,00') && report.includes('różnica 0,00'));
  await shot(d, '20-admin-pos-shift-report-1024');
  // Returns: staff registers a counter return for the POS sale and settles it from the returns screen
  await d.getByRole('button', { name: 'Zamknij pełny ekran' }).click().catch(() => {});
  await d.locator('.admin-navitem', { hasText: 'Wyloguj' }).first().click().catch(() => {});
  await d.getByRole('button', { name: 'Wyloguj' }).click();
  await d.waitForSelector('input[autocomplete="username"]');
  await d.fill('input[autocomplete="username"]', 'admin');
  await d.fill('input[autocomplete="current-password"]', config.admin_password);
  await d.getByRole('button', { name: 'Zaloguj się' }).click();
  await d.waitForSelector('.admin-shell');
  await d.setViewportSize({ width: 1440, height: 900 });
  await d.locator('.admin-navitem', { hasText: 'Zamówienia' }).first().click();
  await d.waitForSelector('.ops-orders-table');
  const posOrder = (await d.locator('.ops-orders-table tbody tr').allInnerTexts()).map((text, index) => ({ text, index })).find(row => row.text.includes('Worek sportowy'));
  await d.locator('.ops-orders-table tbody tr').nth(posOrder.index).getByRole('button').click();
  await d.waitForSelector('.ops-return-create');
  await d.getByRole('button', { name: /Zgłoś zwrot \/ reklamację/ }).click();
  await d.locator('.ops-return-create input[type="checkbox"]').first().check();
  await d.getByRole('button', { name: 'Zapisz zgłoszenie' }).click();
  await d.waitForSelector('.ops-success');
  step('returns: staff registered a counter return on the order', (await d.locator('.ops-order-lines').count()) === 1);
  await shot(d, '22-admin-order-return-1440');
  await d.keyboard.press('Escape');
  await d.locator('.admin-navitem', { hasText: 'Zwroty i reklamacje' }).first().click();
  await d.waitForSelector('.ops-pill.ret-zgloszony');
  await d.getByRole('button', { name: 'Decyzja' }).first().click();
  await d.selectOption('.admin-player-modal select', 'rozliczony');
  await d.selectOption('.admin-player-modal .account-field-row select', 'transfer');
  await d.getByRole('button', { name: 'Zapisz decyzję' }).click();
  await d.waitForSelector('.ops-pill.ret-rozliczony', { timeout: 15000 }).catch(() => {});
  await d.locator('.admin-list-toolbar input[type="checkbox"]').check();
  await d.waitForSelector('.ops-pill.ret-rozliczony');
  step('returns: return settled with transfer refund and visible in history', true);
  await shot(d, '23-admin-returns-1440');
  await d.setViewportSize({ width: 1024, height: 768 });
  await d.locator('.admin-navitem', { hasText: 'Kasa POS' }).first().click();
  await d.waitForSelector('.pos-layout');
  await d.getByRole('button', { name: 'Pełny ekran' }).click();
  step('pos: kiosk layout hides admin chrome', await d.evaluate(() => document.body.classList.contains('staff-fullscreen') && getComputedStyle(document.querySelector('.admin-sidebar')).display === 'none'));
  await shot(d, '21-admin-pos-kiosk-1024');
  await desktop.close();
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} E2E checks passed`);
process.exit(failed.length ? 1 : 0);
