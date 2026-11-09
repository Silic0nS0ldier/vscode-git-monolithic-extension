import assert from "node:assert/strict";
import { appendFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { after, before } from "node:test";
import { errors, type Locator, type Page } from "playwright-core";
import { commitAllIn, commitIn } from "./git.js";
import {
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    loadTimelinePage,
    openFile,
    openPicker,
    openWorkbench,
    pickerRow,
    pollUntil,
    runCommand,
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

async function action(target: Locator, command: string): Promise<void> {
    for (let remaining = 3;; remaining--) {
        await page.keyboard.press("Escape");
        await target.click({ button: "right" });
        try {
            await page.getByRole("menuitem", { name: command, exact: true }).hover({ timeout: 2_000 });
            await page.keyboard.press("Enter");
            await page.locator(".monaco-menu").waitFor({ state: "hidden", timeout: 2_000 });
            return;
        } catch (ex) {
            if (!(ex instanceof errors.TimeoutError) || remaining === 0) throw ex;
        }
    }
}

scenario("workspace history merges detected repositories and loads subsequent pages", async () => {
    await openFile(page, "worktree.txt");
    await runCommand(page, "View: Show Explorer");
    if (!await tree().isVisible()) {
        await page.locator(".pane-header.timeline-view").click();
    }
    await row("Worktree tip").waitFor({ state: "visible" });
    await openFile(page, "clone.txt");
    await row("Clone repository tip").waitFor({ state: "visible" });
    await openFile(page, "secondary.txt");
    await row("Secondary repository tip").waitFor({ state: "visible" });
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
    await row("Clone repository tip").waitFor({ state: "visible" });
    assert.ok(await loadTimelinePage(page), "the first page of two must offer more history");
    for (let attempt = 0; attempt < 8; attempt++) {
        if (!await loadTimelinePage(page)) break;
    }
    assert.doesNotMatch(
        (await tree().locator(".monaco-list-row[data-last-element=\"true\"]").allInnerTexts()).join("\n"),
        /Load more|Loading/u,
    );
    // The worktree shares one traversal with the primary; the shallow clone is a separate three-commit history.
    assert.equal(await tree().locator(".monaco-list-row").first().getAttribute("aria-setsize"), "11");
    // The list only renders the rows in view, so check each end of it.
    const ends = {
        End: [
            "Primary repository change 4",
            "Primary repository change 3",
            "Primary repository change 2",
            "Primary repository root",
            "Worktree tip",
            "Primary repository tip",
        ],
        Home: [
            "Clone repository tip",
            "Clone replacement for primary tip",
            "Secondary repository tip",
            "Secondary repository root",
        ],
    };
    for (const [key, labels] of Object.entries(ends)) {
        await tree().locator(".monaco-list").focus();
        await page.keyboard.press(key);
        for (const label of labels) {
            await row(label).waitFor({ state: "attached" });
        }
        if (key === "End") {
            const primaryTip = row("Primary repository tip").filter({ hasText: basename(workspaceDir()) });
            assert.equal(await row("Worktree tip").getAttribute("aria-posinset"), "6");
            assert.equal(await primaryTip.getAttribute("aria-posinset"), "7");
            assert.match(await primaryTip.innerText(), /Date adjusted for Git order/u);
        }
    }
});

scenario("workspace items resolve their own repository when copying or opening a commit", async () => {
    const cloneShared = row("Clone replacement for primary tip");
    await action(cloneShared, "Copy Commit ID");
    const shared = await commitIn("../timeline-clone", "HEAD^");
    assert.equal(shared, await commitIn(".", "HEAD"));
    await pollUntil(
        "the clone's shared commit ID to reach the clipboard",
        () => page.evaluate(() => navigator.clipboard.readText()),
        text => text === shared,
    );
    await action(row("Secondary repository tip"), "Copy Commit ID");
    const head = await commitIn("../timeline-secondary", "HEAD");
    await pollUntil(
        "the secondary repository's commit ID to reach the clipboard",
        () => page.evaluate(() => navigator.clipboard.readText()),
        text => text === head,
    );
    await action(row("Secondary repository tip"), "Open Commit");
    await page.locator(".part.editor").getByText("secondary.txt", { exact: true }).first().waitFor({
        state: "visible",
    });
    const cloneBoundary = row("Primary repository change 4").filter({ hasText: "timeline-clone" });
    await action(cloneBoundary, "Open Commit");
    await page.locator(".part.editor").getByText("timeline.code-workspace", { exact: true }).first().waitFor({
        state: "visible",
    });
});

scenario("workspace history refreshes after an external commit", async () => {
    await appendFile(join(workspaceDir(), "../timeline-secondary/secondary.txt"), "external commit\n");
    await commitAllIn("../timeline-secondary", "Secondary repository updated");
    await tree().locator(".monaco-list").focus();
    await page.keyboard.press("Home");
    await row("Secondary repository updated").waitFor({ state: "visible" });
});

scenario("closing a repository refreshes the pinned workspace history", async () => {
    await openFile(page, "clone.txt");
    const picker = await openPicker(page, "Git: Close Repository", "Choose a repository");
    await pickerRow(picker, "timeline-clone").click();
    await picker.waitFor({ state: "hidden" });
    await pollUntil(
        "the closed repository to leave workspace history",
        () => tree().innerText(),
        text =>
            text.includes("Secondary repository updated") && text.includes("Secondary repository tip")
            && !text.includes("Clone repository tip"),
    );
});
