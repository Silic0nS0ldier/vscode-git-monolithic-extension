import assert from "node:assert/strict";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { errors, type Locator, type Page } from "playwright-core";
import { headSubject, move, resolveRef, stage, status } from "./git.js";
import {
    connect,
    createScenario,
    diffEditorSides,
    LOAD_TIMEOUT_MS,
    loadTimelinePage,
    notification,
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
    page = await openWorkbench(browser);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
}, { timeout: LOAD_TIMEOUT_MS });
after(async () => {
    await browser.close();
});
const scenario = createScenario(() => page);
const tree = (): Locator => page.locator(".timeline-tree-view");
const row = (label: string): Locator => tree().locator(".monaco-list-row").filter({ hasText: label });

async function openTimeline(file = "history/renamed.txt", firstRow = "Revision 7"): Promise<void> {
    await page.keyboard.press("Escape");
    await openFile(page, file);
    await runCommand(page, "View: Show Explorer");
    if (!await tree().isVisible()) {
        await page.locator(".pane-header.timeline-view").click();
    }
    const header = page.locator(".pane-header.timeline-view");
    await header.hover();
    const unpin = header.getByRole("button", { name: "Unpin Current Timeline", exact: true });
    if (await unpin.count()) await unpin.click();
    const name = file.split("/").at(-1);
    await pollUntil(
        "the Timeline to follow the requested file",
        () => header.innerText(),
        text => name !== undefined && text.includes(name) && !text.includes("(pinned)"),
    );
    await tree().locator(".monaco-list").focus();
    await page.keyboard.press("Home");
    await row(firstRow).waitFor({ state: "visible" });
}

async function openFolderTimeline(name: string, firstRow: string): Promise<void> {
    await page.keyboard.press("Escape");
    await runCommand(page, "View: Show Explorer");
    const folder = page.locator(".explorer-folders-view .monaco-list-row").filter({
        hasText: new RegExp(`^${name}$`, "u"),
    });
    await folder.click({ button: "right" });
    await selectMenuItem(page, "Open Timeline");
    await page.locator(".pane-header.timeline-view").filter({ hasText: name }).waitFor({ state: "visible" });
    await row(firstRow).waitFor({ state: "visible" });
}

async function action(label: string, command: string): Promise<void> {
    await page.keyboard.press("Escape");
    await row(label).click({ button: "right" });
    await selectMenuItem(page, command);
}

async function assertNoComparisonSelection(label: string): Promise<void> {
    await page.keyboard.press("Escape");
    await row(label).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Select for Compare", exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.getByRole("menuitem", { name: "Compare with Selected", exact: true }).count(), 0);
    await page.keyboard.press("Escape");
}

let settingsRevision = 0;

/**
 * Writes a workspace setting and waits for the workbench to apply it. Settings such as
 * `timeline.pageSize` show no effect until the next Timeline request, so each write also
 * carries a unique `window.title`, which the workbench applies from the same read of the file.
 */
async function setting(name: string, value: unknown): Promise<void> {
    const file = join(workspaceDir(), ".vscode/settings.json");
    const settings = JSON.parse(await readFile(file, "utf-8")) as Record<string, unknown>;
    const title = `timeline settings ${++settingsRevision}`;
    await writeFile(file, JSON.stringify({ ...settings, [name]: value, "window.title": title }));
    await pollUntil("the workbench to apply the workspace settings", () => page.title(), text => text === title);
}

async function showHover(label: string, hover: Locator): Promise<void> {
    // A refresh can replace the managed hover while the pointer is over the row.
    for (let remaining = 3;; remaining--) {
        await page.locator(".pane-header.timeline-view").hover();
        await row(label).locator(".label-name").hover();
        try {
            await hover.waitFor({ state: "visible", timeout: 2_000 });
            return;
        } catch (ex) {
            if (!(ex instanceof errors.TimeoutError) || remaining === 0) throw ex;
        }
    }
}

scenario("file history includes staged changes but not working changes by default", async () => {
    await openTimeline();
    await row("Staged").waitFor({ state: "visible" });
    assert.equal(await row("Uncommitted Changes").count(), 0);
    assert.equal(await row("Create original file").count(), 0, "the first request must remain paged");
    assert.equal(await headSubject(), "Revision 7");
    assert.equal((await status())["history/renamed.txt"], "MM");
});

scenario("opening a history entry compares the committed file revisions", async () => {
    await action("Revision 7", "Open Changes");
    const sides = await pollUntil(
        "committed diff to show its changed line",
        () => diffEditorSides(page),
        sides => sides.modified.includes("line 7"),
    );
    assert.ok(sides.original.includes("line 6"));
    assert.ok(!sides.original.includes("line 7"));
    assert.ok(!sides.modified.includes("working-only"));
});

scenario("native Timeline multi-selection compares the historical resource URIs", async () => {
    await openTimeline();
    await page.getByRole("button", { name: "Pin Current Timeline", exact: true }).click();
    await row("Revision 6").click();
    await row("Revision 5").click({ modifiers: ["Control"] });
    assert.equal(await tree().locator(".monaco-list-row[aria-selected=\"true\"]").count(), 2);
    await row("Revision 5").click({ button: "right" });
    await selectMenuItem(page, "Compare Selected");
    await pollUntil(
        "native comparisons to show the selected versions",
        () => diffEditorSides(page),
        sides =>
            !sides.original.includes("line 7") && !sides.modified.includes("line 7")
            && sides.original.includes("line 6") !== sides.modified.includes("line 6"),
    );
});

scenario("selected Timeline versions compare, and different files explain the mismatch", async () => {
    await openTimeline();
    await action("Revision 7", "Select for Compare");
    await action("Revision 6", "Compare with Selected");
    await pollUntil(
        "the selected Timeline versions to be compared",
        () => diffEditorSides(page),
        sides => sides.original.includes("line 7") && !sides.modified.includes("line 7"),
    );
    await openTimeline("other.txt");
    await action("Revision 7", "Compare with Selected");
    await notification(page, /selected Timeline entry is for a different file/u).waitFor({ state: "visible" });
});

scenario("committed entries copy their ID and message and open all changed files", async () => {
    await openTimeline();
    await action("Revision 7", "Copy Commit ID");
    const head = await resolveRef("HEAD");
    await pollUntil(
        "the commit ID to reach the clipboard",
        () => page.evaluate(() => navigator.clipboard.readText()),
        text => text === head,
    );
    await action("Revision 7", "Copy Commit Message");
    await pollUntil(
        "the commit message to reach the clipboard",
        () => page.evaluate(() => navigator.clipboard.readText()),
        text => text === "Revision 7",
    );
    await action("Revision 7", "Open Commit");
    await pollUntil(
        "both files in the commit to load",
        async () => (await page.locator(".part.editor").innerText()).replaceAll(/\s+/gu, " "),
        text => text.includes("line 7") && text.includes("another changed file"),
    );
});

scenario("author and date settings refresh labels and complete local commit metadata", async () => {
    await openTimeline();
    await setting("git_monolithic.timeline.showAuthor", false);
    await pollUntil(
        "author labels to be hidden",
        () => row("Revision 7").innerText(),
        text => !text.includes("Integration Test"),
    );
    await setting("git_monolithic.timeline.showAuthor", true);
    await pollUntil(
        "author labels to return",
        () => row("Revision 7").innerText(),
        text => text.includes("Integration Test"),
    );
    const head = await resolveRef("HEAD");
    assert.ok(head);
    const committedLabel = await row("Revision 7").getAttribute("aria-label");
    assert.ok(committedLabel);
    async function assertRevisionHover(date: Date): Promise<void> {
        const hover = page.locator(".monaco-hover")
            .filter({ hasText: head })
            .filter({ hasText: "Integration Test" })
            .filter({ hasText: "itest@example.invalid" })
            .filter({ hasText: "Revision 7" })
            .filter({ hasText: "1 file(s) changed" })
            .filter({ hasText: date.toLocaleString() });
        await showHover("Revision 7", hover);
    }

    await setting("git_monolithic.timeline.date", "authored");
    let authoredLabel: string | null = null;
    try {
        authoredLabel = await pollUntil(
            "authored dates to refresh the rows",
            () => row("Revision 7").getAttribute("aria-label"),
            label => label !== null && label !== committedLabel,
        );
        await assertRevisionHover(new Date("2001-01-01T00:00:00Z"));
    } finally {
        await setting("git_monolithic.timeline.date", "committed");
    }
    await pollUntil(
        "committed dates to replace the authored-date page",
        () => row("Revision 7").getAttribute("aria-label"),
        label => label !== null && label !== authoredLabel,
    );
    await assertRevisionHover(new Date("2000-01-01T00:00:00Z"));
    await page.locator(".pane-header.timeline-view").hover();
});

scenario("paging follows renames and retains emoji and the complete commit message", async () => {
    await openTimeline();
    for (let attempt = 0; attempt < 3; attempt++) {
        if (!await loadTimelinePage(page)) break;
    }
    await row("Create original file").scrollIntoViewIfNeeded();
    await row("Create original file").waitFor({ state: "visible" });
    const hover = page.locator(".monaco-hover")
        .filter({ hasText: "Create original file ✨" })
        .filter({ hasText: "The complete commit body." });
    await showHover("Create original file", hover);
    await action("Create original file", "Copy Commit Message");
    await pollUntil(
        "the complete multiline message to reach the clipboard",
        () => page.evaluate(() => navigator.clipboard.readText()),
        text => text === "Create original file ✨\n\nThe complete commit body.",
    );
    await action("Create original file", "Open Changes");
    const sides = await pollUntil(
        "the renamed file's original content to load",
        () => diffEditorSides(page),
        sides => sides.modified === "original",
    );
    assert.equal(sides.original, "");
});

scenario("a file Timeline can open a historical submodule update", async () => {
    await openTimeline("modules/sub", "Replace submodule with regular file");
    await action("Update submodule", "Open Commit");
    const before = await resolveRef(":/Configure Timeline fixture");
    const after = await resolveRef(":/Create merged folder");
    assert.ok(before && after);
    await pollUntil(
        "both recorded submodule commits to be shown",
        async () => (await page.locator(".part.editor").innerText()).replaceAll(/\s+/gu, " "),
        text => text.includes(`Subproject commit ${before}`) && text.includes(`Subproject commit ${after}`),
    );
});

scenario("opening a folder Timeline entry shows the entire commit", async () => {
    await openFolderTimeline("history", "Revision 7");
    await row("Revision 7").click();
    await pollUntil(
        "the folder commit to show changes inside and outside the folder",
        async () => (await page.locator(".part.editor").innerText()).replaceAll(/\s+/gu, " "),
        text => text.includes("line 7") && text.includes("another changed file"),
    );
    assert.equal(await headSubject(), "Revision 7");
});

scenario("folder history pages through a merge in Git order and explains adjusted dates", async () => {
    await openFolderTimeline("merged", "Merge side");
    for (let attempt = 0; attempt < 3; attempt++) {
        if (!await loadTimelinePage(page)) break;
    }
    await pollUntil(
        "both sides of the folder merge to be listed",
        () => tree().locator(".monaco-list-row").first().getAttribute("aria-setsize"),
        size => size === "10",
    );
    await tree().locator(".monaco-list").press("End");
    await row("Main 1").waitFor({ state: "attached" });
    const base = row("Create merged folder");
    await base.scrollIntoViewIfNeeded();
    await base.waitFor({ state: "visible" });
    assert.match(await base.innerText(), /Date adjusted for Git order/u);
    const hover = page.locator(".monaco-hover")
        .filter({ hasText: "Relative date adjusted to preserve Git history order" })
        .filter({ hasText: new Date("2003-01-01T00:00:00Z").toLocaleString() });
    await showHover("Create merged folder", hover);
});

scenario("file history pages through both sides of a merge", async () => {
    await openTimeline("merged/shared.txt", "Side 4");
    await pollUntil(
        "the file's initial merge-history page to replace the folder history",
        () => tree().locator(".monaco-list-row").first().getAttribute("aria-setsize"),
        size => size === "6",
    );
    for (let attempt = 0; attempt < 3; attempt++) {
        if (!await loadTimelinePage(page)) break;
    }
    await pollUntil(
        "every commit on both sides of the merge to be listed",
        () => tree().locator(".monaco-list-row").first().getAttribute("aria-setsize"),
        size => size === "9",
    );
    await tree().locator(".monaco-list").press("End");
    for (const label of ["Side 1", "Main 1", "Create merged folder"]) {
        await row(label).waitFor({ state: "attached" });
    }
    assert.equal(await row("Create merged folder").getAttribute("aria-posinset"), "9");
});

scenario("out-of-order dates retain Git order across pages and explain the adjustment", async () => {
    await setting("timeline.pageSize", 1);
    try {
        await openTimeline("clock.txt", "Clock child");
        assert.ok(await loadTimelinePage(page));
        await row("Clock parent").waitFor({ state: "visible" });
        const labels = await tree().locator(".monaco-list-row").allInnerTexts();
        const child = labels.findIndex(label => label.includes("Clock child"));
        const parent = labels.findIndex(label => label.includes("Clock parent"));
        assert.ok(child >= 0 && parent > child, "the child must remain before its newer-dated parent");
        assert.match(await row("Clock parent").innerText(), /Date adjusted for Git order/u);
        const hover = page.locator(".monaco-hover")
            .filter({ hasText: new Date("2002-01-04T00:00:00Z").toLocaleString() })
            .filter({ hasText: new Date("2002-01-03T00:00:00Z").toLocaleString() })
            .filter({ hasText: "Relative date adjusted to preserve Git history order" })
            .filter({ hasText: "differing clocks" });
        await showHover("Clock parent", hover);
    } finally {
        await setting("timeline.pageSize", 5);
    }
});

scenario("a future-dated commit remains below a staged entry across pages", async () => {
    await setting("timeline.pageSize", 1);
    try {
        await openTimeline("future.txt", "Staged");
        assert.ok(await loadTimelinePage(page));
        await row("Future change").waitFor({ state: "visible" });
        assert.equal(await row("Staged").getAttribute("aria-posinset"), "1");
        assert.equal(await row("Future change").getAttribute("aria-posinset"), "2");
        assert.match(await row("Future change").innerText(), /Date adjusted for Git order/u);
        const hover = page.locator(".monaco-hover")
            .filter({ hasText: new Date("2099-01-01T00:00:00Z").toLocaleString() })
            .filter({ hasText: "Relative date adjusted to preserve Git history order" });
        await showHover("Future change", hover);
    } finally {
        await setting("timeline.pageSize", 5);
    }
});

scenario("working changes can be enabled and compared against the staged version", async () => {
    await openTimeline("history/renamed.txt", "Staged");
    await page.locator(".pane-header.timeline-view").filter({ hasText: "renamed.txt" }).waitFor({ state: "visible" });
    await setting("git_monolithic.timeline.showUncommitted", true);
    await row("Uncommitted Changes").waitFor({ state: "visible" });
    await row("Revision 7").waitFor({ state: "visible" });
    await action("Uncommitted Changes", "Open Changes");
    const sides = await pollUntil(
        "working and staged versions to be shown",
        () => diffEditorSides(page),
        sides => sides.modified.includes("working-only") && sides.original.includes("staged-only"),
    );
    assert.ok(!sides.original.includes("working-only"));
    await openFile(page, "history/untracked.txt");
    await page.locator(".pane-header.timeline-view").filter({ hasText: "untracked.txt" }).waitFor({ state: "visible" });
    await row("Uncommitted Changes").waitFor({ state: "visible" });
});

scenario("one-item pages preserve working, staged and committed versions", async () => {
    await openTimeline();
    await setting("timeline.pageSize", 1);
    await setting("git_monolithic.timeline.showAuthor", false);
    await pollUntil(
        "the updated workspace settings to apply",
        () => row("Revision 7").innerText(),
        text => !text.includes("Integration Test"),
    );
    await page.locator(".pane-header.timeline-view").getByRole("button", { name: "Refresh", exact: true }).click();
    await pollUntil(
        "the one-item Timeline page to render",
        () => tree().locator(".monaco-list-row").first().getAttribute("aria-setsize"),
        size => size === "2",
    );
    await row("Uncommitted Changes").waitFor({ state: "visible" });
    assert.equal(await row("Staged").count(), 0);
    assert.ok(await loadTimelinePage(page));
    await row("Staged").waitFor({ state: "visible" });
    assert.ok(await loadTimelinePage(page));
    await row("Revision 7").waitFor({ state: "visible" });
    await setting("timeline.pageSize", 5);
    await setting("git_monolithic.timeline.showAuthor", true);
    await pollUntil(
        "the restored workspace settings to apply",
        () => row("Revision 7").innerText(),
        text => text.includes("Integration Test"),
    );
    await page.locator(".pane-header.timeline-view").getByRole("button", { name: "Refresh", exact: true }).click();
    await pollUntil(
        "the default page budget to return",
        () => tree().locator(".monaco-list-row").first().getAttribute("aria-setsize"),
        size => size === "6",
    );
});

scenario("external index and working-tree writes refresh live entries without reopening the file", async () => {
    await openTimeline();
    await row("Uncommitted Changes").waitFor({ state: "visible" });
    await stage("history/renamed.txt");
    await pollUntil("the index to contain all file changes", status, state => state["history/renamed.txt"] === "M ");
    await row("Uncommitted Changes").waitFor({ state: "hidden" });
    await row("Staged").waitFor({ state: "visible" });
    await appendFile(join(workspaceDir(), "history/renamed.txt"), "external-change\n");
    await pollUntil(
        "Git to report the external working change",
        status,
        state => state["history/renamed.txt"] === "MM",
    );
    await row("Uncommitted Changes").waitFor({ state: "visible" });
    await action("Uncommitted Changes", "Open Changes");
    await pollUntil(
        "the live diff to contain only the external working change",
        () => diffEditorSides(page),
        sides =>
            sides.modified.includes("external-change") && !sides.original.includes("external-change")
            && sides.original.includes("working-only"),
    );
});

scenario("a staged rename keeps the file's committed history", async () => {
    await move("history/renamed.txt", "history/moved.txt");
    await pollUntil(
        "Git to stage the rename",
        status,
        state => state["history/renamed.txt -> history/moved.txt"]?.startsWith("R") === true,
    );
    await openTimeline("history/moved.txt");
    await row("Staged").waitFor({ state: "visible" });
});

scenario("a deleted file's working version compares as empty", async () => {
    await openTimeline("other.txt");
    await rm(join(workspaceDir(), "other.txt"));
    await pollUntil("Git to report the deletion", status, state => state["other.txt"] === " D");
    await row("Uncommitted Changes").waitFor({ state: "visible" });
    await action("Uncommitted Changes", "Open Changes");
    await pollUntil(
        "the deleted file to be compared with its committed content",
        () => diffEditorSides(page),
        sides => sides.original.includes("another changed file") && sides.modified === "",
    );
});

scenario("closing the owning repository clears the comparison selection", async () => {
    await openTimeline("clock.txt", "Clock child");
    await action("Clock child", "Select for Compare");
    await runCommand(page, "Git: Close Repository");
    // A Git configuration change makes the model rediscover the closed workspace repository.
    await setting("git_monolithic.timeline.showAuthor", false);
    try {
        await openTimeline("clock.txt", "Clock child");
        await assertNoComparisonSelection("Clock child");
    } finally {
        await setting("git_monolithic.timeline.showAuthor", true);
    }
});

scenario("disposing the Timeline provider clears the comparison selection", async () => {
    await openTimeline("clock.txt", "Clock child");
    await action("Clock child", "Select for Compare");
    await setting("git_monolithic.enabled", false);
    try {
        await row("Clock child").waitFor({ state: "hidden" });
    } finally {
        await setting("git_monolithic.enabled", true);
    }
    await openTimeline("clock.txt", "Clock child");
    await assertNoComparisonSelection("Clock child");
});
