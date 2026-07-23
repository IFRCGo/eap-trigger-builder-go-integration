/**
 * Playwright diagnostic: injects each Honduras EAP as a persisted draft via
 * localStorage, reloads, counts statement cards per phase, and saves screenshots.
 *
 * Usage (from package root): node scripts/simulate-honduras.mjs
 * Expects the prototype running on http://localhost:3101
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../../../');
const STORAGE_KEY = 'trigger-builder-prototype.stage3-draft';

// Raw statements mirroring pilot_eap_statements.json for each Honduras EAP
const HONDURAS_DROUGHT_STATEMENTS = [
    {
        id: 'hnd-drought-0',
        phase: 'activation',
        canonicalVariable: 'Other',
        subcategory: 'ENSO index',
        operator: '',
        thresholdValue: '',
        thresholdUnit: '',
        probabilityValue: 60,
        leadTimeValue: '3',
        timeframeUnit: 'months',
        geographyType: 'regional',
        geographyLabel: 'area 3.4',
        notes: 'Based on the IRI forecast from the OND quarter (year -1)',
        crossConnector: 'AND',
        sourceAuthority: 'COPECO/CENAOS',
    },
    {
        id: 'hnd-drought-1',
        phase: 'activation',
        canonicalVariable: 'Precipitation',
        subcategory: 'Seasonal total',
        operator: 'between',
        thresholdValue: '10 and 20',
        thresholdUnit: 'percentile',
        probabilityValue: 60,
        leadTimeValue: '3',
        timeframeUnit: 'months',
        geographyType: 'regional',
        geographyLabel: 'dry corridor',
        notes: 'Starting in the MAM quarter (year 1)',
        sourceAuthority: 'COPECO/CENAOS',
    },
    {
        id: 'hnd-drought-2',
        phase: 'stop',
        canonicalVariable: '',
        subcategory: '',
        operator: '',
        thresholdValue: '',
        thresholdUnit: '',
        timeframeUnit: '',
        geographyType: 'national',
        geographyLabel: '',
        notes: 'A shutdown mechanism will be triggered by the update of the quarterly forecast.',
        sourceAuthority: '',
    },
];

const HONDURAS_FLOODS_STATEMENTS = [
    {
        id: 'hnd-floods-0',
        phase: 'pre_activation',
        canonicalVariable: 'Wind',
        subcategory: 'Speed',
        operator: '>=',
        thresholdValue: '34',
        thresholdUnit: 'knots',
        probabilityValue: 60,
        leadTimeValue: '5',
        timeframeUnit: 'days',
        geographyType: 'regional',
        geographyLabel: 'alert zone',
        notes: 'Tropical storm or stronger',
        crossConnector: 'ENABLES',
        sourceAuthority: 'CENAOS or NOAA',
    },
    {
        id: 'hnd-floods-1',
        phase: 'activation',
        canonicalVariable: 'Hydrological Flow',
        subcategory: 'Return period exceedance',
        operator: '==',
        thresholdValue: '10',
        thresholdUnit: 'years',
        probabilityValue: 50,
        leadTimeValue: '3',
        timeframeUnit: 'days',
        geographyType: 'watershed_basin',
        geographyLabel: 'high-risk flood zones',
        notes: 'Probability of river flooding',
        sourceAuthority: 'GEOGLOWS/GloFAS',
    },
    {
        id: 'hnd-floods-2',
        phase: 'stop',
        canonicalVariable: 'Wind',
        subcategory: 'Speed',
        operator: 'reduction',
        thresholdValue: 'tropical disturbance',
        thresholdUnit: '',
        timeframeUnit: '',
        geographyType: 'national',
        geographyLabel: '',
        notes: 'Event decreases in intensity to a tropical disturbance.',
        withinConnector: 'OR',
        sourceAuthority: 'competent forecasting authorities',
    },
    {
        // Previously this had a DUPLICATE id "16389-stop_1-3" — now fixed with unique IDs
        id: 'hnd-floods-3',
        phase: 'stop',
        canonicalVariable: '',
        subcategory: '',
        operator: '',
        thresholdValue: 'abrupt change',
        thresholdUnit: '',
        timeframeUnit: '',
        geographyType: 'national',
        geographyLabel: '',
        notes: 'Event abruptly changes its predicted trajectory.',
        sourceAuthority: 'competent forecasting authorities',
    },
];

const BASE_METADATA = {
    countryOrOperationName: 'Honduras',
    hazardTypes: ['Drought'],
    eapName: 'Drought EAP',
    eapVariant: 'Dual Trigger',
    versionLabel: 'Pilot',
    displayTitleOverrideEnabled: false,
    displayTitleOverride: '',
    interPhasePreToAct: 'PRECEDES',
    interPhaseActToStop: 'ENABLES',
};

async function injectDraftAndTest(browser, label, documentId, metadata, statements, suffix) {
    console.log(`\n=== ${label} ===`);
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // Navigate first to get the right origin for localStorage
    await page.goto('http://localhost:3101/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Inject a PersistedDraft into localStorage
    const draft = {
        startMode: 'pilot',
        selectedExampleId: documentId,
        metadata,
        statements,
        reviewerGuidance: 'Please check dual-trigger logic.',
        savedAt: new Date().toISOString(),
    };
    await page.evaluate(
        ({ key, value }) => { localStorage.setItem(key, JSON.stringify(value)); },
        { key: STORAGE_KEY, value: draft },
    );

    // Reload so the app reads the injected draft
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Count phase headers
    const phaseHeaders = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[class*="phaseGroupTitle"]'));
        return els.map((el) => el.textContent?.trim() ?? '');
    });
    console.log('  Phase headers:', phaseHeaders);

    // Count statement card titles
    const statementTitles = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[class*="statementCardTitle"]'));
        return els.map((el) => el.textContent?.trim() ?? '');
    });
    console.log('  Statement card titles:', statementTitles);

    // Verify expected count
    const expectedTotal = statements.length;
    const actualTotal = statementTitles.length;
    const statusEmoji = actualTotal === expectedTotal ? '✅' : '❌';
    console.log(`  ${statusEmoji} Expected ${expectedTotal} cards, got ${actualTotal}`);

    // Look for any duplicate-key React warnings
    const warnings = [];
    page.on('console', (msg) => {
        if ((msg.type() === 'warning' || msg.type() === 'error') && msg.text().toLowerCase().includes('key')) {
            warnings.push(msg.text());
        }
    });
    await page.waitForTimeout(300);
    if (warnings.length > 0) {
        console.log('  ⚠️  Duplicate-key warnings:', warnings);
    } else {
        console.log('  ✅ No duplicate-key React warnings');
    }

    // Scroll to the builder section
    await page.evaluate(() => {
        const el = document.querySelector('[class*="phaseGroup"]');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await page.waitForTimeout(600);

    // Viewport screenshot (statement cards visible)
    const vpPath = path.join(ROOT, `stage10-honduras-${suffix}.png`);
    await page.screenshot({ path: vpPath, fullPage: false });
    console.log(`  Screenshot: stage10-honduras-${suffix}.png`);

    // Full-page screenshot
    const fullPath = path.join(ROOT, `stage10-honduras-${suffix}-full.png`);
    await page.screenshot({ path: fullPath, fullPage: true });
    console.log(`  Full screenshot: stage10-honduras-${suffix}-full.png`);

    await page.close();
    return { phaseHeaders, statementTitles };
}

async function run() {
    const browser = await chromium.launch({ headless: true });

    try {
        const droughtMeta = { ...BASE_METADATA, hazardTypes: ['Drought'], eapName: 'Drought EAP' };
        const floodsMeta = { ...BASE_METADATA, hazardTypes: ['Flood'], eapName: 'Floods EAP' };

        const drought = await injectDraftAndTest(
            browser,
            'Honduras Drought (17595) — dual trigger, 2 activation + 1 stop',
            '17595',
            droughtMeta,
            HONDURAS_DROUGHT_STATEMENTS,
            'drought',
        );

        const floods = await injectDraftAndTest(
            browser,
            'Honduras Floods (16389) — dual trigger, 1 pre-act + 1 act + 2 stop',
            '16389',
            floodsMeta,
            HONDURAS_FLOODS_STATEMENTS,
            'floods',
        );

        console.log('\n=== Summary ===');
        console.log('Drought — phases:', drought.phaseHeaders);
        console.log('Drought — statements:', drought.statementTitles);
        console.log('Floods  — phases:', floods.phaseHeaders);
        console.log('Floods  — statements:', floods.statementTitles);
    } finally {
        await browser.close();
    }
}

run().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
