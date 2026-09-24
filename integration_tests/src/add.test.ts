import assert from "node:assert";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { headSubject, status } from "./git.js";
import {
    connect,
    createScenario,
    groupCount,
    invokeGroupAction,
    invokeRowAction,
    LOAD_TIMEOUT_MS,
    modalDialog,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    runCommand,
    scmView,
    workspaceDir,
} from "./harness.js";

/** Matches `fixtures/add.sh`. */
const BULK = Array.from(
    { length: 600 },
    (_, i) => `bulk/untracked-with-a-reasonably-long-name-${String(i + 1).padStart(3, "0")}.txt`,
);

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

async function commitFromInputBox(message: string): Promise<void> {
    const view = scmView(page);

    // The input box is a Monaco editor; its textarea is not directly clickable.
    await view.locator(".monaco-editor").first().click();
    await page.keyboard.type(message);
    await page.keyboard.press("Control+Enter");

    await pollUntil("the commit to be created", headSubject, subject => subject === message);
}

scenario("Stage All Changes gives up while untracked files are listed, naming the path git rejected", async () => {
    const view = await openScmView(page);
    await groupCount(view, "Untracked").filter({ hasText: /^600$/u }).waitFor({ state: "visible" });
    const unchanged = await status();

    // Outside `mixed` it stages with `-u`, yet still names the untracked files, which git
    // refuses as pathspecs matching nothing it knows.
    await runCommand(page, "Git: Stage All Changes");

    const dialog = modalDialog(page);
    await dialog.waitFor({ state: "visible" });
    assert.match(
        (await dialog.innerText()).replaceAll(/\s+/gu, " "),
        /Git: pathspec '\S+' did not match any file\(s\) known to git/u,
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "hidden" });

    // Git checks every pathspec before staging anything.
    assert.deepStrictEqual(await status(), unchanged);
});

scenario("staging a file whose name starts with a dash stages that file", async () => {
    const view = scmView(page);

    await invokeRowAction(view, "-dash.txt", "Stage Changes");

    await pollUntil("-dash.txt to be staged", status, current => current["-dash.txt"] === "M ");
    await groupCount(view, "Staged").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });
});

scenario("Stage All Tracked Changes stages modifications and deletions alike", async () => {
    const view = scmView(page);

    await invokeGroupAction(view, "Tracked", "Stage All Tracked Changes");

    const current = await pollUntil(
        "the tracked changes to be staged",
        status,
        current => current["tracked.txt"] === "M " && current["gone.txt"] === "D ",
    );
    // Porcelain status collapses a wholly untracked directory into one entry.
    assert.strictEqual(current["bulk/"], "??");
    await groupCount(view, "Staged").filter({ hasText: /^3$/u }).waitFor({ state: "visible" });
});

scenario("Stage All Untracked Changes adds more files than fit on one command line", async () => {
    const view = scmView(page);

    await invokeGroupAction(view, "Untracked", "Stage All Untracked Changes");

    assert.deepStrictEqual(
        await pollUntil(
            "every untracked file to be staged",
            status,
            current => BULK.every(path => current[path] === "A "),
        ),
        {
            "-dash.txt": "M ",
            "gone.txt": "D ",
            "tracked.txt": "M ",
            ...Object.fromEntries(BULK.map(path => [path, "A "])),
        },
    );
    await groupCount(view, "Staged").filter({ hasText: /^603$/u }).waitFor({ state: "visible" });
});

scenario("committing what is staged empties the index", async () => {
    await commitFromInputBox("Commit what is staged");

    assert.deepStrictEqual(await status(), {});
    // Smart commit reads the view rather than git, so the next scenario has to start from it.
    await groupCount(scmView(page), "Staged").filter({ hasText: /^0$/u }).waitFor({ state: "visible" });
});

scenario("smart commit with nothing staged commits the tracked changes and leaves untracked files", async () => {
    const view = scmView(page);

    await appendFile(join(workspaceDir(), "tracked.txt"), "smart\n");
    await writeFile(join(workspaceDir(), "later.txt"), "later\n");
    await resourceRow(view, "tracked.txt").waitFor({ state: "visible" });
    await resourceRow(view, "later.txt").waitFor({ state: "visible" });

    // Outside `mixed`, smart commit stages with `git add -u -- .`.
    await commitFromInputBox("Smart commit of tracked changes");

    assert.deepStrictEqual(
        await pollUntil("tracked.txt to be committed", status, current => !("tracked.txt" in current)),
        { "later.txt": "??" },
    );
    await groupCount(view, "Tracked").filter({ hasText: /^0$/u }).waitFor({ state: "visible" });
});

scenario("smart commit with untracked changes mixed in commits the untracked files too", async () => {
    const view = scmView(page);

    // Nothing renders `untrackedChanges`, so a setting that does change the view, written
    // alongside it, is what shows the new settings have been read.
    const later = resourceRow(view, "later.txt");
    const openFile = later.getByRole("button", { name: "Open File" });
    await later.hover();
    await openFile.waitFor({ state: "attached" });
    await writeFile(
        join(workspaceDir(), ".vscode", "settings.json"),
        JSON.stringify({
            "git_monolithic.enableSmartCommit": true,
            "git_monolithic.showInlineOpenFileAction": false,
            "git_monolithic.untrackedChanges": "mixed",
        }),
    );
    await later.hover();
    await openFile.waitFor({ state: "detached" });

    // Changed only now, so the view has refreshed since the settings were written.
    await appendFile(join(workspaceDir(), "tracked.txt"), "mixed\n");
    await resourceRow(view, "tracked.txt").waitFor({ state: "visible" });

    // In `mixed`, smart commit stages with `git add -A -- .`.
    await commitFromInputBox("Smart commit of every change");

    assert.deepStrictEqual(
        await pollUntil("later.txt to be committed", status, current => Object.keys(current).length === 0),
        {},
    );
});
