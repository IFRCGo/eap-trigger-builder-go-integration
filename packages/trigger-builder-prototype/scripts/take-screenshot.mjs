import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setViewportSize({ width: 1440, height: 900 });

    console.log('Navigating to http://localhost:3101/ ...');
    await page.goto('http://localhost:3101/');
    await page.waitForTimeout(3000);

    // Scroll down to the review workspace section
    console.log('Scrolling to review workspace...');
    await page.evaluate(() => {
        const el = document.getElementById('review-workspace');
        if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); }
    });
    await page.waitForTimeout(1000);

    console.log('Taking Stage 9 review state machine screenshot...');
    const screenshotPath = path.resolve(__dirname, '../../../../stage9-review-state-machine.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Also capture a full-page screenshot
    const fullPath = path.resolve(__dirname, '../../../../stage9-review-state-machine-full.png');
    await page.screenshot({ path: fullPath, fullPage: true });
    console.log(`Full-page screenshot saved to ${fullPath}`);

    await browser.close();
}

run().catch((err) => {
    console.error('Error during screenshot capture:', err);
    process.exit(1);
});
