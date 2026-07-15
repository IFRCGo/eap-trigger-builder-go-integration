import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const FRONTEND_URL = 'https://trigger-builder-frontend-miiriseyfa-uc.a.run.app';

async function run() {
    console.log('=== EAP E2E Test: Pakistan Riverine Flood (MDRPK024) ===\n');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(0); // disable default; use explicit timeouts per call
    await page.setViewportSize({ width: 1440, height: 900 });

    console.log('[1] Loading page...');
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/e2e-01-initial.png` });
    console.log('    OK');

    console.log('[2] Selecting Pakistan - Riverine Flood (MDRPK024)...');
    await page.locator('input[placeholder="Select a pilot EAP example"]').click({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const pkBtn = page.locator('button[class*="_list-item"]').filter({ hasText: /MDRPK024/ });
    await pkBtn.first().click({ timeout: 10000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/e2e-02-loaded.png` });
    console.log('    OK');

    console.log('[3] Verifying loaded statements...');
    const h1 = await page.locator('h1').first().textContent({ timeout: 5000 });
    console.log(`    Title: "${h1}"`);
    const phaseTexts = await page.locator('h4').allTextContents();
    phaseTexts.filter(t => /Phase|phase/.test(t)).forEach(t => console.log(`    ${t}`));

    console.log('[4] Scrolling to review workspace...');
    await page.evaluate(() => {
        const h = [...document.querySelectorAll('h3')].find(e => e.textContent.toLowerCase().includes('review workspace'));
        if (h) h.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/e2e-03-review.png` });

    console.log('[5] Clicking Generate...');
    const genBtns = page.locator('button').filter({ hasText: /^Generate$/ });
    const genCount = await genBtns.count({ timeout: 5000 });
    console.log(`    ${genCount} Generate button(s)`);

    let clicked = false;
    for (let i = 0; i < genCount; i++) {
        const enabled = await genBtns.nth(i).isEnabled({ timeout: 5000 }).catch(() => false);
        console.log(`    Button ${i}: enabled=${enabled}`);
        if (enabled) {
            await genBtns.nth(i).click({ timeout: 5000 });
            clicked = true;
            break;
        }
    }
    if (!clicked) {
        const status = await page.locator('p').allTextContents();
        console.error('    FAIL: Generate disabled');
        status.filter(s => /readiness|threshold|metadata/i.test(s)).forEach(s => console.error('      ' + s));
        await page.screenshot({ path: `${OUT}/e2e-04-blocked.png`, fullPage: true });
        await browser.close(); return;
    }
    const clickedAt = Date.now();
    console.log('    Clicked — waiting up to 150s for HIGH thinking response...');
    await page.screenshot({ path: `${OUT}/e2e-04-generating.png` });

    console.log('[6] Waiting for AI response...');
    try {
        await page.waitForFunction(
            () => !document.body.innerText.includes('Generating...'),
            null,
            { timeout: 150000, polling: 2000 }
        );
        console.log(`    Response received after ~${Math.round((Date.now() - clickedAt)/1000)}s`);
    } catch {
        console.log(`    Timed out after ~${Math.round((Date.now() - clickedAt)/1000)}s — checking anyway`);
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/e2e-05-result.png`, fullPage: true });

    // Check for error state
    const hasGenerating = await page.evaluate(() => document.body.innerText.includes('Generating...'));
    const hasError = await page.evaluate(() => document.body.innerText.toLowerCase().includes('error') || document.body.innerText.toLowerCase().includes('failed'));
    console.log(`    Still generating: ${hasGenerating}, Error visible: ${hasError}`);

    const reviewText = await page.evaluate(() => {
        const h = [...document.querySelectorAll('h3')].find(e => e.textContent.toLowerCase().includes('review workspace'));
        return h ? (h.closest('[class]')?.innerText || '') : document.body.innerText.slice(0, 3000);
    });
    console.log('\n=== Review Workspace Output ===');
    console.log(reviewText.slice(0, 3000));
    console.log('\n=== Done — screenshots e2e-01..05 in repo root ===');
    await browser.close();
}

run().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
