import assert from "node:assert";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import {
    closeAllEditors,
    connect,
    createScenario,
    diffEditorSides,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    scmView,
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

/** Both sides start empty and fill in once the `gitm:` provider has answered. */
async function renderedDiff(page: Page): Promise<{ original: string; modified: string }> {
    return await pollUntil(
        "the diff editor to render both sides",
        () => diffEditorSides(page),
        ({ original, modified }) => original !== "" && modified !== "",
    );
}

scenario("the staged change is diffed against the commit it was staged over", async () => {
    const view = await openScmView(page);

    // `both.txt` is listed in Staged and in Tracked; Staged renders above Tracked.
    await resourceRow(view, "both.txt").first().click();

    // Reading the index blob rather than the file on disk is the whole point: the working
    // tree says "working" at this path.
    assert.deepStrictEqual(await renderedDiff(page), { modified: "staged", original: "committed" });
});

scenario("the unstaged change is diffed against the index", async () => {
    await closeAllEditors(page);
    const view = scmView(page);

    // The second `both.txt` row is the Tracked one, whose left-hand side resolves to the
    // index because the same path is also staged.
    await resourceRow(view, "both.txt").nth(1).click();

    assert.deepStrictEqual(await renderedDiff(page), { modified: "working", original: "staged" });
});
