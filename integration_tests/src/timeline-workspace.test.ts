import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Locator, Page } from "playwright-core";
import { commitIn } from "./git.js";
import {
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    loadTimelinePage,
    openFile,
    openWorkbench,
    pollUntil,
    runCommand,
    selectMenuItem,
    workspaceDir,
} from "./harness.js";

let browser: Awaited<ReturnType<typeof connect>>;
let page: Page;
before(async () => {
    browser = await connect();
    page = await openWorkbench(browser, join(workspaceDir(), "timeline.code-workspace"));
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
}, { timeout: LOAD_TIMEOUT_MS });
after(async () => {
    await browser.close();
});
const scenario = createScenario(() => page);
const tree = (): Locator => page.locator(".timeline-tree-view");
const row = (label: string): Locator => tree().locator(".monaco-list-row").filter({ hasText: label });

scenario("workspace history merges detected repositories and loads subsequent pages", async () => {
    await openFile(page, "root.txt");
    await runCommand(page, "View: Show Explorer");
    if (!await tree().isVisible()) {
        await page.locator(".pane-header.timeline-view").click();
    }
    await row("Primary repository tip").waitFor({ state: "visible" });
    const header = page.locator(".pane-header.timeline-view");
    await header.hover();
    await header.getByRole("button", { name: "More Actions..." }).click();
    await selectMenuItem(page, "Pin Workspace Timeline");
    await row("Secondary repository tip").waitFor({ state: "visible" });
    for (let attempt = 0; attempt < 4; attempt++) {
        if (!await loadTimelinePage(page)) break;
    }
    for (
        const label of [
            "Primary repository tip",
            "Primary repository root",
            "Secondary repository tip",
            "Secondary repository root",
        ]
    ) {
        await row(label).scrollIntoViewIfNeeded();
        await row(label).waitFor({ state: "visible" });
        assert.equal(await row(label).count(), 1, `${label} must appear exactly once`);
    }
});

scenario("workspace items resolve their own repository when copying or opening a commit", async () => {
    await row("Secondary repository tip").click({ button: "right" });
    await selectMenuItem(page, "Copy Commit ID");
    const head = await commitIn("../timeline-secondary", "HEAD");
    await pollUntil(
        "the secondary repository's commit ID to reach the clipboard",
        () => page.evaluate(() => navigator.clipboard.readText()),
        text => text === head,
    );
    await row("Secondary repository tip").click({ button: "right" });
    await selectMenuItem(page, "Open Commit");
    await page.locator(".part.editor").getByText("secondary.txt", { exact: true }).first().waitFor({
        state: "visible",
    });
});
