import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const frontendUrl = process.env.FRONTEND_URL
    ?? 'https://trigger-builder-frontend-miiriseyfa-uc.a.run.app';
const accessCode = process.env.PROTOTYPE_ACCESS_CODE;
const prohibitedNotice = 'AI-polished wording is not yet protected by automated fact-preservation validation. Review all trigger facts before approval.';
const editedMarker = 'Reviewer-confirmed Phase 1 cloud acceptance edit.';

if (!accessCode) {
    throw new Error('PROTOTYPE_ACCESS_CODE is required.');
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(scriptDirectory, '../test-results/cloud-phase1');
await mkdir(outputDirectory, { recursive: true });

const results = [];
const consoleErrors = [];
const requestFailures = [];
const observedResponses = [];

function record(name, passed, detail) {
    results.push({ name, passed, detail });
    const marker = passed ? 'PASS' : 'FAIL';
    console.log(`${marker} ${name}${detail ? `: ${detail}` : ''}`);
}

function assertResult(name, condition, detail) {
    record(name, Boolean(condition), detail);
    if (!condition) {
        throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
    }
}

function sanitizedRequest(urlString) {
    const url = new URL(urlString);
    return `${url.hostname}${url.pathname}`;
}

async function waitForGeneration(page, actionLabel) {
    const output = page.locator('textarea[name="aiCombined"]');
    const failure = page.getByText(/Generation failed:/i);

    const outcome = await Promise.race([
        output.waitFor({ state: 'visible', timeout: 175_000 }).then(() => 'output'),
        failure.waitFor({ state: 'visible', timeout: 175_000 }).then(() => 'failure'),
    ]);

    if (outcome === 'failure') {
        throw new Error(`${actionLabel} failed: ${await failure.first().innerText()}`);
    }

    await page.getByRole('button', { name: actionLabel }).first().waitFor({ state: 'visible', timeout: 10_000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(20_000);

page.on('console', (message) => {
    if (message.type() === 'error') {
        consoleErrors.push(message.text().replace(/pk\.[A-Za-z0-9._-]+/g, '[REDACTED_MAPBOX_TOKEN]'));
    }
});
page.on('requestfailed', (request) => {
    requestFailures.push({
        request: sanitizedRequest(request.url()),
        reason: request.failure()?.errorText ?? 'unknown',
    });
});
page.on('response', (response) => {
    const url = new URL(response.url());
    if (
        url.hostname.includes('mapbox.com')
        || url.hostname === 'goadmin.ifrc.org'
        || url.hostname.includes('trigger-builder-backend')
    ) {
        observedResponses.push({
            host: url.hostname,
            path: url.pathname,
            status: response.status(),
            method: response.request().method(),
        });
    }
});

try {
    await page.goto(frontendUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.locator('h1').filter({ hasText: /Operation:.*Prototype v1/i }).waitFor();
    assertResult('Cloud frontend loads', true, frontendUrl);
    assertResult('Prohibited persistent notice is absent', !(await page.locator('body').innerText()).includes(prohibitedNotice));

    const pilotInput = page.locator('input[placeholder="Select a pilot EAP example"]');
    await pilotInput.click();
    const pilotOption = page.locator('button[class*="_list-item"]').filter({ hasText: /MDRPK024/ }).first();
    await pilotOption.click();
    await page.waitForTimeout(3_000);
    assertResult('Pakistan pilot seed loads', (await page.locator('body').innerText()).includes('MDRPK024'));

    assertResult(
        'Structured GO country is Pakistan',
        await page.getByText('Pakistan', { exact: true }).count() > 0,
    );

    const geographySelectorCount = await page.getByRole('button', { name: 'Open map selector' }).count();
    assertResult('Pilot exposes geography selectors', geographySelectorCount > 0, `${geographySelectorCount} selector(s)`);
    for (let index = 0; index < geographySelectorCount; index += 1) {
        await page.getByRole('button', { name: 'Open map selector' }).nth(index).click();
        const map = page.getByRole('application', { name: /Geography map for Pakistan/i });
        await map.waitFor({ state: 'visible', timeout: 30_000 });
        if (index === 0) {
            await page.waitForTimeout(8_000);
            assertResult('Country-aware geography map renders', await map.isVisible());
            assertResult('No Mapbox unavailable fallback is shown', await page.getByText(/Mapbox (?:geography )?unavailable/i).count() === 0);
        }

        const searchInput = page.locator('input[placeholder="Search for a station, gauge, basin reference, or place"]');
        if (await searchInput.isVisible().catch(() => false)) {
            await searchInput.fill('Lahore');
            await page.getByRole('button', { name: 'Search Mapbox' }).click();
            const suggestionList = page.getByLabel('Mapbox search results');
            await suggestionList.waitFor({ state: 'visible', timeout: 30_000 });
            await suggestionList.getByRole('button').first().click();
        }
        else {
            const mapCentreButton = page.getByRole('button', { name: 'Select administrative area at map centre' });
            await mapCentreButton.waitFor({ state: 'visible', timeout: 30_000 });
            await mapCentreButton.click();
        }

        const confirmButton = page.getByRole('button', { name: 'Confirm geography' }).first();
        try {
            await confirmButton.waitFor({ state: 'visible', timeout: 45_000 });
        }
        catch (error) {
            const relevantText = (await page.locator('body').innerText())
                .split('\n')
                .filter((line) => /mapbox|geograph|selection|result/i.test(line))
                .slice(0, 30);
            console.error(`GEOGRAPHY_DIAGNOSTIC ${JSON.stringify(relevantText)}`);
            console.error(`MAPBOX_RESPONSES ${JSON.stringify(observedResponses.filter((response) => response.host.includes('mapbox.com')))}`);
            throw error;
        }
        await confirmButton.click();
        await page.getByRole('button', { name: 'Close map selector' }).click();
    }
    assertResult(
        'All statement geographies require and accept confirmation',
        await page.getByText('Geography confirmed', { exact: true }).count() >= geographySelectorCount,
        `${geographySelectorCount} confirmed`,
    );

    const generateButtons = page.getByRole('button', { name: 'Generate', exact: true });
    let generateButton;
    for (let index = 0; index < await generateButtons.count(); index += 1) {
        if (await generateButtons.nth(index).isEnabled()) {
            generateButton = generateButtons.nth(index);
            break;
        }
    }
    assertResult('Generate becomes enabled after readiness checks', Boolean(generateButton));
    await generateButton.click();

    await page.getByRole('heading', { name: 'Prototype access code' }).waitFor();
    await page.locator('input[name="prototypeAccessCode"]').fill(accessCode);
    await page.getByRole('button', { name: 'Continue generation' }).click();
    await waitForGeneration(page, 'Regenerate');
    assertResult('Real Django and Gemini generation completes', true);

    const combinedOutput = page.locator('textarea[name="aiCombined"]');
    const firstGeneratedText = await combinedOutput.inputValue();
    assertResult('Generated combined statement is non-empty', firstGeneratedText.trim().length > 40);

    await page.locator('textarea[name="reviewerGuidance"]').fill('Keep the language concise while preserving all trigger facts.');
    await page.getByRole('button', { name: 'Regenerate', exact: true }).last().click();
    await page.getByText(/Regenerating\.\.\./).first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.getByText(/Regenerating\.\.\./).first().waitFor({ state: 'hidden', timeout: 175_000 });
    assertResult('Real regeneration completes', await combinedOutput.isVisible());

    const regeneratedText = await combinedOutput.inputValue();
    await combinedOutput.fill(`${regeneratedText}\n\n${editedMarker}`);
    await page.getByText('Edited AI version requires approval').waitFor();
    assertResult('Editing AI output resets approval', true);

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const aiExportCheckbox = page.getByRole('checkbox', { name: /AI-polished version/i });
    assertResult('Unapproved AI export option is disabled', await aiExportCheckbox.isDisabled());
    await page.getByTitle('Close').click();

    await page.getByRole('button', { name: 'Approve AI version for export' }).click();
    await page.getByText('AI version approved for export').waitFor();
    assertResult('Explicit AI approval succeeds', true);

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    assertResult('Approved AI export option is enabled', await aiExportCheckbox.isEnabled());
    assertResult('Approved AI export option is selected', await aiExportCheckbox.isChecked());

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download JSON bundle' }).click();
    const download = await downloadPromise;
    const downloadPath = path.join(outputDirectory, 'phase1-export.json');
    await download.saveAs(downloadPath);
    const exportedJson = JSON.parse(await readFile(downloadPath, 'utf8'));
    const serializedExport = JSON.stringify(exportedJson);
    assertResult('Approved edited AI text is present in JSON export', serializedExport.includes(editedMarker));
    assertResult('Approval metadata is present in JSON export', serializedExport.includes('approved'));
    assertResult('Model and prompt metadata are present in JSON export', (
        serializedExport.includes('gemini-3.5-flash')
        && serializedExport.includes('phase1-v1')
    ));
    await page.getByTitle('Close').click();

    await page.screenshot({
        path: path.join(outputDirectory, 'desktop-approved.png'),
        fullPage: true,
    });
    record(
        'Mobile layout audit excluded from Phase 1 acceptance',
        true,
        'Excluded by user direction; desktop behavior remains in scope.',
    );

    const goCountryResponse = observedResponses.find((response) => (
        response.host === 'goadmin.ifrc.org'
        && response.path.includes('/api/v2/country')
        && response.status === 200
    ));
    assertResult('Real GO country API returns 200', Boolean(goCountryResponse));

    const mapboxStyleResponse = observedResponses.find((response) => (
        response.host.includes('mapbox.com')
        && response.path.includes('/styles/v1/go-ifrc/')
        && response.status >= 200
        && response.status < 300
    ));
    assertResult('Restricted Mapbox token loads the IFRC style', Boolean(mapboxStyleResponse));

    const mapboxSearchResponse = observedResponses.find((response) => (
        response.host.includes('mapbox.com')
        && (response.path.includes('/search/') || response.path.includes('/geocoding/'))
        && response.status >= 200
        && response.status < 300
    ));
    assertResult('Mapbox Search succeeds from the deployed origin', Boolean(mapboxSearchResponse));

    const generationResponses = observedResponses.filter((response) => (
        response.host.includes('trigger-builder-backend')
        && response.path.endsWith('/regenerate')
    ));
    assertResult(
        'Real backend generation requests return 200',
        generationResponses.length >= 2 && generationResponses.every((response) => response.status === 200),
        `${generationResponses.length} request(s): ${generationResponses.map((response) => response.status).join(', ')}`,
    );

    const failedCriticalResponses = observedResponses.filter((response) => (
        (response.host.includes('mapbox.com') || response.host.includes('trigger-builder-backend'))
        && response.status >= 400
    ));
    assertResult(
        'No Mapbox or Django HTTP failures were observed',
        failedCriticalResponses.length === 0,
        failedCriticalResponses.map((response) => `${response.status} ${response.host}${response.path}`).join('; '),
    );
    const canceledMapboxRequests = requestFailures.filter(({ request, reason }) => (
        request.startsWith('api.mapbox.com/')
        && reason === 'net::ERR_ABORTED'
    ));
    const unexpectedRequestFailures = requestFailures.filter(
        (failure) => !canceledMapboxRequests.includes(failure),
    );
    record(
        'Browser-canceled obsolete Mapbox requests are treated as benign',
        true,
        canceledMapboxRequests.length ? `${canceledMapboxRequests.length} canceled request(s)` : undefined,
    );
    assertResult(
        'No unexpected browser request failures were observed',
        unexpectedRequestFailures.length === 0,
        JSON.stringify(unexpectedRequestFailures),
    );
    assertResult('No browser console errors were observed', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (error) {
    await page.screenshot({
        path: path.join(outputDirectory, 'failure.png'),
        fullPage: true,
    }).catch(() => undefined);
    console.error(`E2E_FAILURE ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
} finally {
    console.log(`SUMMARY ${results.filter((result) => result.passed).length}/${results.length} checks passed`);
    console.log(`ARTIFACTS ${outputDirectory}`);
    await browser.close();
}
