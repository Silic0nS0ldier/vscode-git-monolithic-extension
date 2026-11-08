import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before } from "node:test";
import { errors, type Locator, type Page } from "playwright-core";
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
    // Repository discovery can refresh the view and close its menu before the action is selected.
    for (let remaining = 3;; remaining--) {
        await header.hover();
        await header.getByRole("button", { name: "More Actions..." }).click();
        try {
            await page.getByRole("menuitem", { name: "Pin Workspace Timeline", exact: true })
                .click({ timeout: 2_000 });
            break;
        } catch (ex) {
            if (!(ex instanceof errors.TimeoutError) || remaining === 0) throw ex;
            await page.keyboard.press("Escape");
        }
    }
    await row("Secondary repository tip").waitFor({ state: "visible" });
    assert.ok(await loadTimelinePage(page), "the first page of two must offer more history");
    for (let attempt = 0; attempt < 8; attempt++) {
        if (!await loadTimelinePage(page)) break;
    }
    // A page of only commits the worktree shares, sent with a cursor, would leave the Load more row loading.
    assert.doesNotMatch(
        (await tree().locator(".monaco-list-row[data-last-element=\"true\"]").allInnerTexts()).join("\n"),
        /Load more|Loading/u,
    );
    // Eight distinct commits in eight rows, so the worktree's shared history is listed once and nothing is left to load.
    assert.equal(await tree().locator(".monaco-list-row").first().getAttribute("aria-setsize"), "8");
    // The list only renders the rows in view, so check each end of it.
    const ends = {
        End: [
            "Primary repository change 4",
            "Primary repository change 3",
            "Primary repository change 2",
            "Primary repository root",
            "Worktree tip",
        ],
        Home: ["Secondary repository tip", "Secondary repository root", "Primary repository tip"],
    };
    for (const [key, labels] of Object.entries(ends)) {
        await tree().locator(".monaco-list").focus();
        await page.keyboard.press(key);
        for (const label of labels) {
            await row(label).waitFor({ state: "attached" });
        }
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
