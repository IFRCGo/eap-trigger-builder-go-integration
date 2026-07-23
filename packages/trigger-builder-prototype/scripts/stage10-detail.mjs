import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const OUT = path.resolve(path.dirname(__filename), '../../../../stage10-checks');
const BASE = 'http://localhost:3101';

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') }).then(() => console.log('  saved:', name));

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // ── BLANK STATE: section-by-section ────────────────────────────────────────
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 1. Statement builder header
    await page.evaluate(() => { document.getElementById('statement-builder')?.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(400);
    await shot(page, 'detail-01-builder-top');

    // 2. First card header (phase group + card header row)
    await page.evaluate(() => {
        const cards = document.querySelectorAll('[class*="statementCard"]');
        if (cards[0]) cards[0].scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(400);
    await shot(page, 'detail-02-card-header');

    // 3. Threshold block (scroll it to centre so all fields are visible)
    await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('*'));
        const el = all.find((e) => e.textContent?.trim() === 'THRESHOLD CLAUSE' && e.children.length === 0);
        el?.closest('[class*="expandable"], [class*="Expandable"]')?.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(400);
    await shot(page, 'detail-03-threshold-block');

    // 4. Connectors section
    await page.evaluate(() => { document.getElementById('connectors')?.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(400);
    await shot(page, 'detail-04-connectors');

    // ── PILOT EXAMPLE LOADED ────────────────────────────────────────────────────
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Find the Example <select> inside the START POINT card and pick the first real option
    const selected = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
            const opts = Array.from(sel.options);
            const firstReal = opts.find((o) => o.value && o.value !== '');
            if (firstReal) {
                sel.value = firstReal.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                return firstReal.text;
            }
        }
        return null;
    });
    console.log('  pilot selected via native select:', selected);
    await page.waitForTimeout(2500);
    await shot(page, 'detail-05-pilot-loaded');

    // 5. Statement builder with pilot data loaded
    await page.evaluate(() => { document.getElementById('statement-builder')?.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(400);
    await shot(page, 'detail-06-pilot-statement-builder');

    // 6. First pilot statement card — check structure
    await page.evaluate(() => {
        const cards = document.querySelectorAll('[class*="statementCard"]');
        if (cards[0]) cards[0].scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(400);
    await shot(page, 'detail-07-pilot-first-card');

    // 7. Connectors with pilot data (should show within-phase connectors)
    await page.evaluate(() => { document.getElementById('connectors')?.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(400);
    await shot(page, 'detail-08-pilot-connectors');

    // 8. Review workspace — structural preview
    await page.evaluate(() => { document.getElementById('review-workspace')?.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(400);
    await shot(page, 'detail-09-review-workspace');

    // 9. Full page with pilot loaded
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
            const firstReal = Array.from(sel.options).find((o) => o.value && o.value !== '');
            if (firstReal) {
                sel.value = firstReal.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                break;
            }
        }
    });
    await page.waitForTimeout(2500);
    await shot(page, 'detail-10-pilot-full-page'); // viewport only
    await page.screenshot({ path: path.join(OUT, 'detail-10-pilot-full-page-all.png'), fullPage: true });
    console.log('  saved: detail-10-pilot-full-page-all (full page)');

    await browser.close();
    console.log('\nDone. Outputs in:', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
