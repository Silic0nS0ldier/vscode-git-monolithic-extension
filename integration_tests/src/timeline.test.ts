import assert from "node:assert/strict";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Locator, Page } from "playwright-core";
import { headSubject, move, resolveRef, stage, status } from "./git.js";
import {
    connect,
    createScenario,
    diffEditorSides,
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
    const unpin = page.getByRole("button", { name: "Unpin Current Timeline", exact: true });
    if (await unpin.count()) await unpin.click();
    await openFile(page, file);
    await runCommand(page, "View: Show Explorer");
    if (!await tree().isVisible()) {
        await page.locator(".pane-header.timeline-view").click();
    }
    await tree().locator(".monaco-list").focus();
    await page.keyboard.press("Home");
    await row(firstRow).waitFor({ state: "visible" });
}

async function openFolderTimeline(name: string, firstRow: string): Promise<void> {
    await runCommand(page, "View: Show Explorer");
    const folder = page.locator(".explorer-folders-view .monaco-list-row").filter({
        hasText: new RegExp(`^${name}$`, "u"),
    });
    await folder.click({ button: "right" });
    await selectMenuItem(page, "Open Timeline");
    await row(firstRow).waitFor({ state: "visible" });
}

async function action(label: string, command: string): Promise<void> {
    await page.keyboard.press("Escape");
    await row(label).click({ button: "right" });
    await selectMenuItem(page, command);
}

async function setting(name: string, value: unknown): Promise<void> {
    const file = join(workspaceDir(), ".vscode/settings.json");
    const settings = JSON.parse(await readFile(file, "utf-8")) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...settings, [name]: value }));
}

scenario("file history appears with staged changes and paged commits, but not working changes by default", async () => {
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

scenario("the Timeline copy and two-version comparison commands are registered and usable", async () => {
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
    await action("Revision 7", "Select for Compare");
    await action("Revision 6", "Compare with Selected");
    await pollUntil(
        "two selected revisions to open",
        () => diffEditorSides(page),
        sides => sides.original.includes("line 7") && !sides.modified.includes("line 7"),
    );
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
    await setting("git_monolithic.timeline.date", "authored");
    await pollUntil(
        "authored dates to refresh the rows",
        () => row("Revision 7").getAttribute("aria-label"),
        label => label?.includes("years") === true,
    );
    await page.locator(".pane-header.timeline-view").hover();
    await row("Revision 7").locator(".label-name").hover();
    const head = await resolveRef("HEAD");
    assert.ok(head);
    await pollUntil(
        "authored-date metadata and statistics to appear",
        async () => (await page.locator(".monaco-hover").innerText()).replaceAll(/\s+/gu, " "),
        text =>
            text.includes("2001") && text.includes("itest@example.invalid") && text.includes(head)
            && text.includes("1 file(s) changed"),
    );
    await page.locator(".pane-header.timeline-view").hover();
    await setting("git_monolithic.timeline.date", "committed");
    await pollUntil(
        "committed dates to replace the authored-date page",
        () => row("Revision 7").getAttribute("aria-label"),
        label => label !== null && !label.includes("years"),
    );
});

scenario("paging follows the rename into the original filename and retains the full commit message", async () => {
    await openTimeline();
    for (let attempt = 0; attempt < 3; attempt++) {
        if (!await loadTimelinePage(page)) break;
    }
    await row("Create original file").scrollIntoViewIfNeeded();
    await row("Create original file").waitFor({ state: "visible" });
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

scenario("working changes can be enabled and compared against the staged version", async () => {
    await openTimeline();
    await setting("git_monolithic.timeline.showUncommitted", true);
    await row("Uncommitted Changes").waitFor({ state: "visible" });
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

scenario("a folder Timeline opens the complete commit, including files outside that folder", async () => {
    await openFolderTimeline("history", "Revision 7");
    await action("Revision 7", "Open Commit");
    await page.locator(".part.editor").getByText("other.txt", { exact: true }).first().waitFor({ state: "visible" });
    assert.equal(await headSubject(), "Revision 7");
});

scenario("folder history pages through both sides of a merge", async () => {
    await openFolderTimeline("merged", "Merge side");
    for (let attempt = 0; attempt < 3; attempt++) {
        if (!await loadTimelinePage(page)) break;
    }
    await pollUntil(
        "every commit on both sides of the merge to be listed",
        () => tree().locator(".monaco-list-row").first().getAttribute("aria-setsize"),
        size => size === "10",
    );
    await row("Main 1").waitFor({ state: "attached" });
    await row("Create merged folder").waitFor({ state: "attached" });
});

scenario("file history pages through both sides of a merge", async () => {
    await openTimeline("merged/shared.txt", "Side 4");
    for (let attempt = 0; attempt < 3; attempt++) {
        if (!await loadTimelinePage(page)) break;
    }
    // `--follow` lists commits with a diff for the file, which git does not compute for a merge.
    await pollUntil(
        "every commit on both sides of the merge to be listed",
        () => tree().locator(".monaco-list-row").first().getAttribute("aria-setsize"),
        size => size === "9",
    );
    for (const label of ["Side 1", "Main 1", "Create merged folder"]) {
        await row(label).waitFor({ state: "attached" });
    }
});

scenario("opening a commit that updates a submodule shows the submodule commits it recorded", async () => {
    await openFolderTimeline("modules", "Update submodule");
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
