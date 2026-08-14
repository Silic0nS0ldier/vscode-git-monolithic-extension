import assert from "node:assert";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import {
    closePicker,
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    openPicker,
    openScmView,
    openWorkbench,
    pickerRowLabels,
} from "./harness.js";

let browser: Awaited<ReturnType<typeof connect>>;
let page: Page;

before(async () => {
    browser = await connect();
    page = await openWorkbench(browser);
}, { timeout: LOAD_TIMEOUT_MS });

after(async () => {
    await browser.close();
});

const scenario = createScenario(() => page);

scenario("the stash picker lists stashes newest first", async () => {
    await openScmView(page);

    const picker = await openPicker(page, "Git: Pop Stash...", "Pick a stash to pop");

    try {
        assert.deepStrictEqual(await pickerRowLabels(picker), [
            "#0: On main: Second stash",
            "#1: On main: First stash",
        ]);
    } finally {
        await closePicker(page);
    }
});
