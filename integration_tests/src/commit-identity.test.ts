import assert from "node:assert";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { headSubject, status, unsetLocalConfig } from "./git.js";
import {
    connect,
    createScenario,
    dialog,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    scmInputText,
    scmView,
    workspaceDir,
} from "./harness.js";

const COMMIT_MESSAGE = "Commit needing an identity";

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

async function submitCommit(): Promise<void> {
    const view = scmView(page);
    // The input box is a Monaco editor; its textarea is not directly clickable.
    await view.locator(".monaco-editor").first().click();
    await page.keyboard.press("Control+Enter");
}

async function dismiss(prompt: ReturnType<typeof dialog>): Promise<void> {
    await page.keyboard.press("Escape");
    await prompt.waitFor({ state: "hidden" });
}

scenario("a commit rejected by a hook reports the hook's message, not missing user details", async () => {
    const view = await openScmView(page);

    await view.locator(".monaco-editor").first().click();
    await page.keyboard.type(COMMIT_MESSAGE);
    await page.keyboard.press("Control+Enter");

    const error = dialog(page, /Commit rejected by the test hook/u);
    await error.waitFor({ state: "visible" });
    assert.strictEqual(await dialog(page, /user\.name/u).count(), 0, "the hook failure blamed user details");
    await dismiss(error);

    assert.strictEqual(await headSubject(), "Initial commit");
    assert.deepStrictEqual(await status(), { "tracked.txt": "M " });
});

scenario("committing without user details reports them as missing and commits nothing", async () => {
    await rm(join(workspaceDir(), ".git", "reject-commit"));
    await unsetLocalConfig("user.name");
    await unsetLocalConfig("user.email");

    const view = scmView(page);
    assert.strictEqual(await scmInputText(view), COMMIT_MESSAGE, "the failed commit lost its message");
    await submitCommit();

    const error = dialog(page, /Make sure you configure your 'user\.name' and 'user\.email' in git\./u);
    await error.waitFor({ state: "visible" });
    await dismiss(error);

    assert.strictEqual(await headSubject(), "Initial commit");
    assert.deepStrictEqual(await status(), { "tracked.txt": "M " });
});
