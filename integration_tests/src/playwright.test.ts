import pw from "playwright";
// use @playwright/test

const browser = await pw.chromium.connect("ws://localhost:3000");
const context = browser.contexts()[0] || (await browser.newContext());
const page = await context.newPage();

// Navigate to the URL
await page.goto("https://example.com/");
console.log("Page loaded successfully");
const screenshot = await page.screenshot();
