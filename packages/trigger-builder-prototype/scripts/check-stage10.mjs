/**
 * Stage 10 visual QA script — checks 10a through 10e
 * Run from the package root: node scripts/check-stage10.mjs
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT = path.resolve(__dirname, '../../../../stage10-checks');

import { mkdirSync } from 'fs';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3101';

async function shot(page, name, fullPage = false) {
    const p = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: p, fullPage });
    console.log(`  saved → ${p}`);
    return p;
}

async function run() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // ──────────────────────────────────────────────
    // Stage 10a — Blank start state
    // ──────────────────────────────────────────────
    console.log('\n[10a] Blank start state');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await shot(page, '10a-blank-initial');
    await shot(page, '10a-blank-full', true);

    // ──────────────────────────────────────────────
    // Stage 10b — Statement card structure
    //   • Phase dropdown must NOT appear inside the card
    //   • Canonical variable must be INSIDE the threshold block
    //   • "Threshold clause" ExpandableContainer must be first structured element
    // ──────────────────────────────────────────────
    console.log('\n[10b] Statement card structure');
    // Scroll to the statement builder section
    await page.evaluate(() => {
        const el = document.getElementById('statement-builder');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page.waitForTimeout(500);
    await shot(page, '10b-statement-builder-view');

    // Check: phase SelectInput should NOT be inside the card body
    const phaseDropdownInCard = await page.evaluate(() => {
        // Look for a select with name="phase" inside a statement card body
        const cardBodies = document.querySelectorAll('[class*="statementCardBody"]');
        for (const body of cardBodies) {
            if (body.querySelector('select[name="phase"], [data-name="phase"]')) return true;
            // Also check for label text "Phase" inside the card body
            const labels = body.querySelectorAll('label');
            for (const label of labels) {
                if (label.textContent?.trim() === 'Phase') return true;
            }
        }
        return false;
    });
    console.log(`  Phase dropdown in card body: ${phaseDropdownInCard ? '❌ STILL PRESENT' : '✅ removed'}`);

    // Check: canonical variable label must appear inside the threshold ExpandableContainer
    const canonVarInsideThreshold = await page.evaluate(() => {
        // Find the threshold expandable container
        const headings = document.querySelectorAll('[class*="ExpandableContainer"], [class*="expandableContainer"]');
        for (const el of headings) {
            const headingText = el.textContent || '';
            if (headingText.includes('Threshold clause')) {
                // Check if canonical variable label is inside it
                const labels = el.querySelectorAll('label, [class*="label"]');
                for (const label of labels) {
                    if (label.textContent?.toLowerCase().includes('canonical variable')) return true;
                }
            }
        }
        // Alternative: check if a label "Canonical variable" exists and its ancestor is a threshold container
        const allLabels = document.querySelectorAll('label');
        for (const label of allLabels) {
            if (label.textContent?.trim().toLowerCase().includes('canonical variable')) {
                // Walk up to see if it's inside a threshold block
                let el = label.parentElement;
                while (el) {
                    if (el.textContent?.includes('Threshold clause')) return true;
                    el = el.parentElement;
                }
            }
        }
        return false;
    });
    console.log(`  Canonical variable inside threshold block: ${canonVarInsideThreshold ? '✅ correct' : '❌ still outside'}`);

    // Scroll into statement card and take detailed shot
    await page.evaluate(() => {
        const cards = document.querySelectorAll('[class*="statementCard"]');
        if (cards[0]) cards[0].scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page.waitForTimeout(300);
    await shot(page, '10b-statement-card-detail');

    // ──────────────────────────────────────────────
    // Stage 10c — InfoPopup tooltips on connectors
    //   • Connector vocabulary card should be GONE
    //   • InfoPopup must appear next to connector selects
    // ──────────────────────────────────────────────
    console.log('\n[10c] Connector InfoPopup tooltips');
    await page.evaluate(() => {
        const el = document.getElementById('connectors');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page.waitForTimeout(500);
    await shot(page, '10c-connectors-view');

    // Check: old vocabulary card should be absent
    const vocabCardPresent = await page.evaluate(() => {
        const all = document.querySelectorAll('[class*="vocabularyCard"], [class*="vocab"]');
        if (all.length > 0) return true;
        // Also check for a heading "Connector vocabulary" or "Connector definitions"
        const headings = document.querySelectorAll('h1,h2,h3,h4,h5,h6,[class*="heading"]');
        for (const h of headings) {
            if (h.textContent?.toLowerCase().includes('connector vocabulary')) return true;
        }
        return false;
    });
    console.log(`  Old vocabulary card: ${vocabCardPresent ? '❌ still present' : '✅ removed'}`);

    // Check: InfoPopup (button with tooltip) is present near connectors
    const infoPopupPresent = await page.evaluate(() => {
        // Look for info popup buttons (typically a small button with ℹ or similar near connector selects)
        const connectorSection = document.getElementById('connectors');
        if (!connectorSection) return false;
        // Check for buttons that could be info popups
        const buttons = connectorSection.querySelectorAll('button');
        for (const btn of buttons) {
            const title = btn.getAttribute('title') || btn.getAttribute('aria-label') || btn.textContent || '';
            if (title.toLowerCase().includes('info') || title.includes('ℹ') || title.includes('?')) return true;
        }
        // Check for any element with "InfoPopup" related class
        const infoEls = connectorSection.querySelectorAll('[class*="info"], [class*="Info"], [class*="popup"], [class*="tooltip"]');
        return infoEls.length > 0;
    });
    console.log(`  InfoPopup present in connectors: ${infoPopupPresent ? '✅ present' : '⚠️  not detected (check screenshot)'}`);

    // ──────────────────────────────────────────────
    // Stage 10d — CSS alignment / max-width tokens
    // ──────────────────────────────────────────────
    console.log('\n[10d] CSS layout alignment');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const layoutCheck = await page.evaluate(() => {
        // Check the main form stack has a reasonable max-width (should be ~1280px via GO token)
        const formStack = document.querySelector('[class*="formStack"]');
        const pageContent = document.querySelector('[class*="pageContent"]');
        const results = {
            formStackMaxWidth: formStack ? getComputedStyle(formStack).maxWidth : 'not found',
            formStackWidth: formStack ? formStack.getBoundingClientRect().width : 'not found',
            pageContentPadding: pageContent ? getComputedStyle(pageContent).padding : 'not found',
            viewportWidth: window.innerWidth,
        };
        return results;
    });
    console.log(`  formStack maxWidth: ${layoutCheck.formStackMaxWidth}`);
    console.log(`  formStack actual width: ${layoutCheck.formStackWidth}px (viewport: ${layoutCheck.viewportWidth}px)`);
    console.log(`  pageContent padding: ${layoutCheck.pageContentPadding}`);
    await shot(page, '10d-layout-full', true);

    // ──────────────────────────────────────────────
    // Stage 10e — Pilot example comparison view
    //   • Load a pilot example
    //   • Verify "Compare with original" section appears
    // ──────────────────────────────────────────────
    console.log('\n[10e] Pilot example comparison view');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Click "Start from a pilot EAP" button
    const pilotBtn = await page.$('button:has-text("pilot"), button:has-text("Pilot"), button:has-text("example"), button:has-text("Example")');
    if (pilotBtn) {
        await pilotBtn.click();
        await page.waitForTimeout(1000);
        await shot(page, '10e-after-pilot-click');
    } else {
        // Try finding it via text content
        await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            const btn = btns.find(b => b.textContent?.toLowerCase().includes('pilot') || b.textContent?.toLowerCase().includes('example'));
            if (btn) btn.click();
        });
        await page.waitForTimeout(1000);
    }

    // Look for example dropdown/search and select first option
    await page.waitForTimeout(500);
    const exampleSelect = await page.$('input[placeholder*="example"], input[placeholder*="Example"], input[placeholder*="search"], select[name*="example"]');
    if (exampleSelect) {
        await exampleSelect.click();
        await page.waitForTimeout(500);
        // Press ArrowDown to select first option
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        await shot(page, '10e-pilot-loaded');
        await shot(page, '10e-pilot-loaded-full', true);
    } else {
        // Try clicking any option that appears
        const firstOption = await page.$('[class*="option"], [role="option"]');
        if (firstOption) {
            await firstOption.click();
            await page.waitForTimeout(2000);
            await shot(page, '10e-pilot-loaded');
        } else {
            await shot(page, '10e-no-pilot-select-found');
            console.log('  ⚠️  Could not find pilot example selector');
        }
    }

    // Scroll to review workspace
    await page.evaluate(() => {
        const el = document.getElementById('review-workspace');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page.waitForTimeout(500);
    await shot(page, '10e-review-workspace');

    // Check for originalStatements / comparison view elements
    const comparisonPresent = await page.evaluate(() => {
        // Look for comparison-related text or sections
        const body = document.body.textContent || '';
        return body.includes('Compare') || body.includes('Original') || body.includes('original');
    });
    console.log(`  Comparison section present in DOM: ${comparisonPresent ? '✅ yes' : '⚠️  not yet (need to generate first)'}`);

    // ──────────────────────────────────────────────
    // Full-page final shot
    // ──────────────────────────────────────────────
    console.log('\n[summary] Final full-page screenshot');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await shot(page, '10-final-full', true);

    await browser.close();
    console.log(`\n✅ All screenshots saved to: ${OUT}`);
}

run().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
