const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log("Navigating to http://localhost:3000");
    await page.goto('http://localhost:3000');

    // Wait for the AI Monitor button and click it to open the panel
    console.log("Opening AI monitor");
    await page.waitForSelector('text=👁️ AI Monitor');
    await page.click('text=👁️ AI Monitor');

    // Wait for the instruction input field
    console.log("Typing instruction");
    const inputSelector = 'input[placeholder="e.g. Click the checkout button..."]';
    await page.waitForSelector(inputSelector);
    await page.fill(inputSelector, 'Click the Shop the Sale button');

    // Click Cmd
    console.log("Clicking Cmd");
    await page.click('text=Cmd');

    // Listen for console logs or intercept the route
    page.on('response', response => {
        if (response.url().includes('/api/agent')) {
            console.log(`API Agent Response: ${response.status()}`);
        }
    });

    // Watch for intersection/scroll to prove the anchor link was clicked
    // Wait for 5 seconds for the LLM to process and click
    console.log("Waiting for LLM to process and click...");
    await page.waitForTimeout(5000);

    // Check if we scrolled down to the products section (Shop the Sale links to #products)
    const scrollY = await page.evaluate(() => window.scrollY);
    console.log(`Scroll Y Position after instruction: ${scrollY}`);

    if (scrollY > 100) {
        console.log("SUCCESS: Page scrolled down, indicating 'Shop the Sale' native click was executed!");
    } else {
        console.log("FAILED: Page did not scroll. Click might not have happened.");

        // Let's dump the tracker events to see what occurred
        const trackerEvents = await page.evaluate(() => {
            // get react context if possible, or just look at the DOM elements in the monitor
            return Array.from(document.querySelectorAll('.tracker-event')).map(el => el.textContent);
        });
        console.log("Tracker events on screen:", trackerEvents);
    }

    await browser.close();
})();
