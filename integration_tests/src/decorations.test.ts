import assert from "node:assert";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Locator, Page } from "playwright-core";
import { headSubject, status } from "./git.js";
import {
    connect,
    createScenario,
    groupCount,
    invokeRowAction,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    workspaceDir,
} from "./harness.js";

const COMMIT_MESSAGE = "Commit the staged files";

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

function explorerRow(fileName: string): Locator {
    const name = new RegExp(`^${fileName.replaceAll(".", String.raw`\.`)}$`, "u");
    return page.locator(".explorer-folders-view .monaco-list-row")
        .filter({ has: page.locator(".label-name").filter({ hasText: name }) });
}

/** The letter the explorer renders after each file name, or "" for an undecorated file. */
async function badges(fileNames: string[]): Promise<Record<string, string>> {
    const entries = await Promise.all(fileNames.map(async fileName => {
        const label = explorerRow(fileName).locator(".monaco-icon-label");
        // The badge is a pseudo-element, so it is absent from the rendered text.
        const content = await label.evaluate(el => getComputedStyle(el, "::after").content);
        return [fileName, content === "none" ? "" : content.replaceAll("\"", "")] as const;
    }));
    return Object.fromEntries(entries);
}

async function expectBadges(describe: string, expected: Record<string, string>): Promise<void> {
    await page.keyboard.press("Control+Shift+E");
    assert.deepStrictEqual(
        await pollUntil(
            describe,
            () => badges(Object.keys(expected)),
            current => Object.entries(expected).every(([fileName, badge]) => current[fileName] === badge),
        ),
        expected,
    );
}

scenario("the explorer decorates each file by its status", async () => {
    const view = await openScmView(page);
    await resourceRow(view, "untracked.txt").waitFor({ state: "visible" });

    await expectBadges("the initial decorations", {
        "clean.txt": "",
        "modified.txt": "M",
        "staged.txt": "M",
        "untracked.txt": "U",
    });
});

scenario("staging an untracked file redecorates it as added", async () => {
    const view = await openScmView(page);

    await invokeRowAction(view, "untracked.txt", "Stage Changes");
    await pollUntil("untracked.txt to be staged", status, current => current["untracked.txt"] === "A ");

    await expectBadges("untracked.txt to be decorated as added", {
        "clean.txt": "",
        "modified.txt": "M",
        "staged.txt": "M",
        "untracked.txt": "A",
    });
});

scenario("committing removes the decorations of what was committed", async () => {
    const view = await openScmView(page);
    await groupCount(view, "Staged").filter({ hasText: /^2$/u }).waitFor({ state: "visible" });

    // The input box is a Monaco editor; its textarea is not directly clickable.
    await view.locator(".monaco-editor").first().click();
    await page.keyboard.type(COMMIT_MESSAGE);
    await page.keyboard.press("Control+Enter");
    await pollUntil("the commit to be created", headSubject, subject => subject === COMMIT_MESSAGE);

    await expectBadges("the committed files to lose their decorations", {
        "clean.txt": "",
        "modified.txt": "M",
        "staged.txt": "",
        "untracked.txt": "",
    });
});

scenario("a file created on disk is decorated as untracked", async () => {
    await writeFile(join(workspaceDir(), "created.txt"), "created\n");

    await expectBadges("created.txt to be decorated as untracked", {
        "clean.txt": "",
        "created.txt": "U",
        "modified.txt": "M",
        "staged.txt": "",
        "untracked.txt": "",
    });
});
