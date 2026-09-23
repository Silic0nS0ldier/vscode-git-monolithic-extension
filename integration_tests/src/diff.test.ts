import assert from "node:assert";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { commitIn } from "./git.js";
import {
    closeAllEditors,
    connect,
    createScenario,
    editorText,
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

/**
 * A submodule has no blob to show, so the editor renders the output of `git diff` itself.
 * It starts empty and fills in once the `gitm:` provider has answered.
 */
async function renderedDiff(page: Page): Promise<string> {
    return await pollUntil(
        "the editor to render the submodule diff",
        () => editorText(page),
        text => text.includes("Subproject commit"),
    );
}

scenario("the staged submodule revision is diffed against the commit it was staged over", async () => {
    const view = await openScmView(page);

    // `sub` is listed in Staged and in Tracked; Staged renders above Tracked.
    await resourceRow(view, "sub").first().click();

    const diff = await renderedDiff(page);
    assert.ok(diff.includes(`-Subproject commit ${await commitIn("sub", "main~2")}`), diff);
    assert.ok(diff.includes(`+Subproject commit ${await commitIn("sub", "main~1")}`), diff);
});

scenario("the unstaged submodule revision is diffed against the index", async () => {
    await closeAllEditors(page);
    const view = scmView(page);

    // The second `sub` row is the Tracked one, whose left-hand side is the staged revision
    // rather than the committed one.
    await resourceRow(view, "sub").nth(1).click();

    const diff = await renderedDiff(page);
    assert.ok(diff.includes(`-Subproject commit ${await commitIn("sub", "main~1")}`), diff);
    assert.ok(diff.includes(`+Subproject commit ${await commitIn("sub", "main")}`), diff);
});
