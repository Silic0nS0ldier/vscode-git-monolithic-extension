import assert from "node:assert";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { headSubject, status } from "./git.js";
import {
    connect,
    createScenario,
    groupCount,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    runCommand,
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

scenario("undoing the last commit restores its message and its changes", async () => {
    const view = await openScmView(page);

    await runCommand(page, "Git: Undo Last Commit");

    // The message is read back out of the commit itself, body and all.
    assert.strictEqual(
        await pollUntil("the commit message to be restored", () => scmInputText(view), text => text !== ""),
        "Second commit Body line for the message",
    );

    assert.strictEqual(await headSubject(), "Initial commit");
    await groupCount(view, "Staged").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });
    assert.deepStrictEqual(await status(), { "tracked.txt": "M " });
});
