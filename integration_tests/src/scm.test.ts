import assert from "node:assert";
import test, { after, before } from "node:test";
import type { Page } from "playwright-core";
import { headSubject, status } from "./git.js";
import {
    capture,
    closeOutputPanel,
    connect,
    filteredOutputPanelText,
    groupCount,
    invokeRowAction,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    runCommand,
    scmView,
} from "./harness.js";

const COMMIT_MESSAGE = "Commit from the SCM input box";

let browser: Awaited<ReturnType<typeof connect>>;
let page: Page;

before(async () => {
    browser = await connect();
    page = await openWorkbench(browser);
}, { timeout: LOAD_TIMEOUT_MS });

after(async () => {
    await browser.close();
});

/**
 * The scenarios share one editor and one repository, and each one builds on the state the
 * previous left behind, so they must stay in file order.
 */
function scenario(name: string, body: () => Promise<void>): void {
    const slug = name.replaceAll(/[^a-z0-9]+/giu, "-");

    test(name, { timeout: LOAD_TIMEOUT_MS }, async () => {
        try {
            await body();
            await capture(page, slug);
        } catch (error) {
            // A closed page cannot be captured; the original failure is the useful one.
            await capture(page, `failure-${slug}`).catch(() => {});
            throw error;
        }
    });
}

scenario("the extension activates and reports working tree changes", async () => {
    // The extension owns the only source control provider, so a populated SCM view proves
    // it activated, found the repository and ran git against it.
    const view = await openScmView(page);

    for (const change of ["tracked.txt", "untracked.txt"]) {
        await resourceRow(view, change).waitFor({ state: "visible" });
    }

    assert.deepStrictEqual(await status(), { "tracked.txt": " M", "untracked.txt": "??" });
});

scenario("the provider is this extension rather than VS Code's builtin git", async () => {
    // Both extensions contribute this command, but the builtin hides its palette entries
    // while `git.enabled` is false, which is also the condition this extension waits for.
    await runCommand(page, "Git: Show Git Output");

    assert.match(
        await filteredOutputPanelText(page, "Git Monolithic"),
        /Activating Git Monolithic extension/u,
        "Git Monolithic stayed dormant, so the SCM view above belongs to the builtin git extension",
    );

    await closeOutputPanel(page);
});

scenario("staging a change writes it to the index", async () => {
    const view = scmView(page);

    await invokeRowAction(view, "tracked.txt", "Stage Changes");

    await groupCount(view, "Staged").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });
    assert.deepStrictEqual(
        await pollUntil("tracked.txt to be staged", status, current => current["tracked.txt"] === "M "),
        { "tracked.txt": "M ", "untracked.txt": "??" },
    );
});

scenario("unstaging returns the change to the working tree", async () => {
    const view = scmView(page);

    await invokeRowAction(view, "tracked.txt", "Unstage Changes");

    await groupCount(view, "Staged").filter({ hasText: /^0$/u }).waitFor({ state: "visible" });
    assert.deepStrictEqual(
        await pollUntil("tracked.txt to leave the index", status, current => current["tracked.txt"] === " M"),
        { "tracked.txt": " M", "untracked.txt": "??" },
    );
});

scenario("committing from the input box clears the working tree", async () => {
    const view = scmView(page);

    await invokeRowAction(view, "tracked.txt", "Stage Changes");
    await pollUntil("tracked.txt to be staged", status, current => current["tracked.txt"] === "M ");
    await invokeRowAction(view, "untracked.txt", "Stage Changes");
    await pollUntil("untracked.txt to be staged", status, current => current["untracked.txt"] === "A ");

    // The index is ahead of the view for a moment, and committing before the view catches
    // up prompts to stage everything instead.
    await groupCount(view, "Staged").filter({ hasText: /^2$/u }).waitFor({ state: "visible" });

    // The input box is a Monaco editor; its textarea is not directly clickable.
    await view.locator(".monaco-editor").first().click();
    await page.keyboard.type(COMMIT_MESSAGE);
    await page.keyboard.press("Control+Enter");

    assert.strictEqual(
        await pollUntil("the commit to be created", headSubject, subject => subject === COMMIT_MESSAGE),
        COMMIT_MESSAGE,
    );
    assert.deepStrictEqual(await status(), {});
    await resourceRow(view, "tracked.txt").waitFor({ state: "detached" });
});
