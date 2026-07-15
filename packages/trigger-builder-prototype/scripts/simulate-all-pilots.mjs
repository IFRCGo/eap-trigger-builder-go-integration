/**
 * Playwright regression test: for each of the 18 pilot EAPs, injects the
 * parsePilotStatements output as a persisted draft via localStorage, reloads,
 * and asserts that rendered statement card counts match the gold-standard
 * expectations in src/data/__fixtures__/pilotEapExpectations.ts.
 *
 * Usage (from package root, with dev server running on http://localhost:3101):
 *   node scripts/simulate-all-pilots.mjs
 *
 * Options (env vars):
 *   SCREENSHOT_DIR   — directory for screenshots (default: project root)
 *   BASE_URL         — prototype URL (default: http://localhost:3101)
 *   HEADLESS         — set to "false" to watch in browser (default: true)
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3101';
const HEADLESS = process.env.HEADLESS !== 'false';
const ROOT = path.resolve(__dirname, '../../../../');
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? ROOT;
const STORAGE_KEY = 'trigger-builder-prototype.stage3-draft';

// Gold-standard expectations (mirrors pilotEapExpectations.ts)
const EXPECTATIONS = {
    '16389': { total: 4, pre_activation: 1, activation: 1, stop: 2 },
    '16399': { total: 9, pre_activation: 6, activation: 2, stop: 1 },
    '16416': { total: 21, pre_activation: 2, activation: 19, stop: 0 },
    '16440': { total: 1, pre_activation: 0, activation: 1, stop: 0 },
    '16445': { total: 1, pre_activation: 0, activation: 1, stop: 0 },
    '16473': { total: 2, pre_activation: 0, activation: 2, stop: 0 },
    '16527': { total: 4, pre_activation: 0, activation: 4, stop: 0 },
    '16566': { total: 5, pre_activation: 2, activation: 3, stop: 0 },
    '16567': { total: 4, pre_activation: 2, activation: 2, stop: 0 },
    '16633': { total: 1, pre_activation: 0, activation: 1, stop: 0 },
    '16845': { total: 8, pre_activation: 3, activation: 3, stop: 2 },
    '16877': { total: 3, pre_activation: 1, activation: 1, stop: 1 },
    '17044': { total: 6, pre_activation: 0, activation: 4, stop: 2 },
    '17240': { total: 5, pre_activation: 1, activation: 3, stop: 1 },
    '17253': { total: 3, pre_activation: 1, activation: 2, stop: 0 },
    '17366': { total: 5, pre_activation: 2, activation: 2, stop: 1 },
    '17595': { total: 3, pre_activation: 0, activation: 2, stop: 1 },
    '26012': { total: 4, pre_activation: 0, activation: 3, stop: 1 },
};

// Raw pilot statements — loaded from the generated JSON file
const STATEMENTS_FILE = path.resolve(
    __dirname,
    '../src/data/generated/pilot_eap_statements.json',
);

function loadStatements() {
    const raw = fs.readFileSync(STATEMENTS_FILE, 'utf8');
    return JSON.parse(raw);
}

function buildDraft(eapId, statements) {
    return {
        startMode: 'pilot',
        selectedExampleId: eapId,
        metadata: {
            countryOrOperationName: `Pilot EAP ${eapId}`,
            hazardTypes: ['Unknown'],
            eapName: `EAP ${eapId}`,
            eapVariant: 'Pilot',
            versionLabel: 'Stage 10a',
            displayTitleOverrideEnabled: false,
            displayTitleOverride: '',
            interPhasePreToAct: 'PRECEDES',
            interPhaseActToStop: 'ENABLES',
        },
        statements: statements.map((s, index) => ({
            ...s,
            // Reproduce the parsePilotStatements ID generation pattern
            id: `${eapId}-${index}-sim`,
            phase: s.phase || 'activation',
            geographyType: s.geographyType || 'national',
        })),
        reviewerGuidance: 'Automated pilot simulation — Stage 10a.',
        savedAt: new Date().toISOString(),
    };
}

async function testEap(browser, eapId, rawStatements, expected) {
    const page = await browser.newPage();
    const warnings = [];

    page.on('console', (msg) => {
        const text = msg.text();
        if (
            (msg.type() === 'warning' || msg.type() === 'error') &&
            text.toLowerCase().includes('key')
        ) {
            warnings.push(text);
        }
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const draft = buildDraft(eapId, rawStatements);
    await page.evaluate(
        ({ key, value }) => {
            localStorage.setItem(key, JSON.stringify(value));
        },
        { key: STORAGE_KEY, value: draft },
    );

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Count rendered statement card titles
    const cardTitles = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[class*="statementCardTitle"]'));
        return els.map((el) => el.textContent?.trim() ?? '');
    });

    const actualTotal = cardTitles.length;
    const totalOk = actualTotal === expected.total;
    const keyWarningsOk = warnings.length === 0;

    const statusIcon = totalOk && keyWarningsOk ? '✅' : '❌';
    console.log(
        `  ${statusIcon} EAP ${eapId}: expected ${expected.total} cards, got ${actualTotal}` +
        (keyWarningsOk ? '' : ` | ⚠️  ${warnings.length} key warning(s)`),
    );

    if (!totalOk) {
        console.log(`     Cards found: ${JSON.stringify(cardTitles)}`);
    }
    if (!keyWarningsOk) {
        console.log(`     Key warnings: ${JSON.stringify(warnings.slice(0, 3))}`);
    }

    // Expand all collapsed ExpandableContainers so every phase and field is visible
    await page.evaluate(() => {
        // Click any toggle buttons that are in a collapsed state
        const toggles = Array.from(
            document.querySelectorAll('[class*="expandableContainer"] [class*="headerButton"]'),
        );
        for (const toggle of toggles) {
            const container = toggle.closest('[class*="expandableContainer"]');
            const content = container?.querySelector('[class*="content"]');
            // If content is hidden or has zero height, click to expand
            if (content && (content as HTMLElement).offsetHeight === 0) {
                (toggle as HTMLElement).click();
            }
        }
    });
    await page.waitForTimeout(600);

    // Scroll to the very top so the full-page screenshot starts from the page header
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Full-page screenshot — captures every phase section and all statement cards
    const screenshotPath = path.join(SCREENSHOT_DIR, `stage10a-eap-${eapId}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await page.close();
    return { eapId, actualTotal, expectedTotal: expected.total, totalOk, keyWarningsOk };
}

async function run() {
    const allStatements = loadStatements();
    const eapIds = Object.keys(EXPECTATIONS);

    console.log(`\nStage 10a — Simulate all ${eapIds.length} pilot EAPs\n`);
    console.log(`Server: ${BASE_URL}`);
    console.log(`Screenshots → ${SCREENSHOT_DIR}\n`);

    const browser = await chromium.launch({ headless: HEADLESS });
    const results = [];

    for (const eapId of eapIds) {
        const rawStatements = allStatements[eapId] ?? [];
        const expected = EXPECTATIONS[eapId];
        try {
            const result = await testEap(browser, eapId, rawStatements, expected);
            results.push(result);
        } catch (err) {
            console.error(`  ❌ EAP ${eapId} threw an error:`, err.message);
            results.push({ eapId, totalOk: false, keyWarningsOk: false, error: err.message });
        }
    }

    await browser.close();

    // Summary
    const passed = results.filter((r) => r.totalOk && r.keyWarningsOk).length;
    const failed = results.length - passed;
    console.log(`\n=== Summary ===`);
    console.log(`Passed: ${passed}/${results.length}`);
    if (failed > 0) {
        console.log(`Failed:`);
        for (const r of results.filter((r) => !r.totalOk || !r.keyWarningsOk)) {
            console.log(
                `  EAP ${r.eapId}: got ${r.actualTotal ?? '?'} / expected ${r.expectedTotal ?? '?'}` +
                (r.error ? ` (error: ${r.error})` : ''),
            );
        }
        process.exit(1);
    } else {
        console.log('All pilot EAPs rendered correctly. ✅');
    }
}

run().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
