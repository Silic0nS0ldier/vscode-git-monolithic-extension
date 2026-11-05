import assert from "node:assert";
import { execFile } from "node:child_process";
import { appendFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { promisify } from "node:util";
import type { Locator, Page } from "playwright-core";
import {
    closeOutputPanel,
    connect,
    createScenario,
    filteredOutputPanelText,
    LOAD_TIMEOUT_MS,
    notification,
    openScmView,
    openWorkbench,
    resourceRow,
    runCommand,
    scmView,
    showGitOutput,
    workspaceDir,
} from "./harness.js";

/** Set by `fixtures/untracked-timeout.sh`. */
const TIMED_OUT = /took longer than the git command timeout \(5s\)/u;

const blockingIgnoreFile = (): string => join(workspaceDir(), "sub", ".gitignore");

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

function groupName(view: Locator, label: string): Locator {
    return view.locator(".resource-group .name").filter({ hasText: new RegExp(`^${label}$`, "u") });
}

/** The count of pending changes on the activity bar's Source Control entry. */
function pendingChanges(count: number): Locator {
    return page.locator(".part.activitybar .action-item")
        .filter({ has: page.locator(".badge-content").filter({ hasText: new RegExp(`^${count}$`, "u") }) })
        .first();
}

scenario("a timed out untracked lookup is reported, while tracked and staged changes are listed", async () => {
    const view = await openScmView(page);

    await resourceRow(view, "tracked.txt").waitFor({ state: "visible" });
    await resourceRow(view, "staged.txt").waitFor({ state: "visible" });
    await groupName(view, "Untracked \\(refresh failed\\)").waitFor({ state: "visible" });
    assert.strictEqual(await resourceRow(view, "untracked.txt").count(), 0);

    await notification(page, TIMED_OUT).waitFor({ state: "visible" });
});

scenario("the notification opens the git log, which holds the failure", async () => {
    await notification(page, TIMED_OUT).getByRole("button", { name: "Open Git Log" }).click();

    // The panel renders the tail of the multi-line entry, which holds the stack of the failed lookup.
    await filteredOutputPanelText(page, "Repository.getStatusUntracked");
    await closeOutputPanel(page);
    await notification(page, TIMED_OUT).waitFor({ state: "hidden" });
});

scenario("a lookup that keeps failing does not notify again", async () => {
    const view = scmView(page);

    await appendFile(join(workspaceDir(), "other.txt"), "modified\n");
    await runCommand(page, "Git: Refresh");

    // The count is only set once the untracked lookup has been reported.
    await pendingChanges(3).waitFor({ state: "visible", timeout: 20_000 });
    await groupName(view, "Untracked \\(refresh failed\\)").waitFor({ state: "visible" });
    assert.strictEqual(await notification(page, TIMED_OUT).count(), 0);
});

scenario("once untracked files can be listed again, they are shown", async () => {
    const view = scmView(page);
    await rm(blockingIgnoreFile());
    await writeFile(blockingIgnoreFile(), "");

    await runCommand(page, "Git: Refresh");

    await resourceRow(view, "untracked.txt").waitFor({ state: "visible", timeout: 20_000 });
    await groupName(view, "Untracked").waitFor({ state: "visible" });
});

scenario("a lookup failing after one succeeded notifies again", async () => {
    await rm(blockingIgnoreFile());
    // Node cannot create a FIFO itself (https://github.com/nodejs/node/issues/38344), so this runs the system tool.
    await promisify(execFile)("mkfifo", [blockingIgnoreFile()]);

    await runCommand(page, "Git: Refresh");

    await notification(page, TIMED_OUT).waitFor({ state: "visible", timeout: 20_000 });
    await groupName(scmView(page), "Untracked \\(refresh failed\\)").waitFor({ state: "visible" });
});

scenario("a changed timeout applies to later git commands, without reopening the repository", async () => {
    const view = scmView(page);
    await writeFile(
        join(workspaceDir(), ".vscode", "settings.json"),
        JSON.stringify({ "git_monolithic.commandTimeout": 1000 }),
    );
    await showGitOutput(page);
    await filteredOutputPanelText(page, "Git commands now stop after 1000ms");
    await closeOutputPanel(page);

    // A success first, so the next failure is notified again.
    await rm(blockingIgnoreFile());
    await writeFile(blockingIgnoreFile(), "");
    await runCommand(page, "Git: Refresh");
    await resourceRow(view, "untracked.txt").waitFor({ state: "visible", timeout: 20_000 });

    await rm(blockingIgnoreFile());
    await promisify(execFile)("mkfifo", [blockingIgnoreFile()]);
    const started = Date.now();
    await runCommand(page, "Git: Refresh");

    await notification(page, /took longer than the git command timeout \(1s\)/u).waitFor({ state: "visible" });
    // Well short of the 5s the lookup would take under the previous timeout.
    assert.ok(Date.now() - started < 4_000, `the lookup took ${Date.now() - started}ms to time out`);
});
