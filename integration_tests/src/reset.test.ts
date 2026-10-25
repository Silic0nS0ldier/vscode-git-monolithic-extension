import assert from "node:assert";
import { after, before } from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { Page } from "playwright-core";
import { headSubject, status } from "./git.js";
import {
    connect,
    createScenario,
    dialog,
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

scenario("declining to undo a merge commit leaves it in place", async () => {
    const view = await openScmView(page);
    assert.deepStrictEqual(await status(), { "tracked.txt": " M", "untracked.txt": "??" });

    await runCommand(page, "Git: Undo Last Commit");

    const prompt = dialog(page, /The last commit was a merge commit/u);
    await prompt.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await prompt.waitFor({ state: "hidden" });

    assert.strictEqual(await headSubject(), "Merge branch 'side'");
    assert.deepStrictEqual(await status(), { "tracked.txt": " M", "untracked.txt": "??" });
    assert.strictEqual(await scmInputText(view), "");
});

scenario("undoing a merge commit moves HEAD to its first parent and stages what it merged", async () => {
    const view = await openScmView(page);

    await runCommand(page, "Git: Undo Last Commit");

    const prompt = dialog(page, /The last commit was a merge commit/u);
    await prompt.getByRole("button", { name: "Undo merge commit" }).click();

    assert.strictEqual(
        await pollUntil("the merge message to be restored", () => scmInputText(view), text => text !== ""),
        "Merge branch 'side' Merge body line",
    );
    assert.strictEqual(await headSubject(), "Main change");
    // A soft reset keeps the index and the work tree: unstaged and untracked changes survive.
    assert.deepStrictEqual(await status(), { "side.txt": "A ", "tracked.txt": " M", "untracked.txt": "??" });
});

scenario("undoing an ordinary commit keeps everything already staged", async () => {
    const view = await openScmView(page);

    await runCommand(page, "Git: Undo Last Commit");

    assert.strictEqual(
        await pollUntil("the commit message to be replaced", () => scmInputText(view), text => text === "Main change"),
        "Main change",
    );
    assert.strictEqual(await headSubject(), "Base");
    await pollUntil(
        "the reset to be reflected in the index",
        status,
        current => isDeepStrictEqual(current, { "side.txt": "A ", "tracked.txt": "MM", "untracked.txt": "??" }),
    );
});
