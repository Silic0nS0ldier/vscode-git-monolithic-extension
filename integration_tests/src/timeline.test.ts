import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { errors, type Locator, type Page } from "playwright-core";
import { headSubject, resolveRef, status } from "./git.js";
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

scenario("committed file history appears in bounded pages without live entries", async () => {
    await openTimeline();
    assert.equal(await row("Staged").count(), 0);
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
    await action("Create original file", "Open Changes");
    const sides = await pollUntil(
        "the renamed file's original content to load",
        () => diffEditorSides(page),
        sides => sides.modified === "original",
    );
    assert.equal(sides.original, "");
});

scenario("file history pages through both sides of a merge", async () => {
    await openTimeline("merged/shared.txt", "Side 4");
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
