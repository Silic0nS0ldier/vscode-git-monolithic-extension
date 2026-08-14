import assert from "node:assert";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import {
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    scmInputText,
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

scenario("the commit template is pre-filled into the input box, comment stripped", async () => {
    // `restoreCommitTemplate` is hidden from the palette (`"when": "false"`): the template
    // reaches the input box on its own, via `commitTemplate` on every model refresh.
    const view = await openScmView(page);

    const text = await pollUntil("the template to be restored", () => scmInputText(view), value => value !== "");

    assert.strictEqual(text, "Template subject Template body");
    assert.doesNotMatch(text, /must not reach/u);
});
