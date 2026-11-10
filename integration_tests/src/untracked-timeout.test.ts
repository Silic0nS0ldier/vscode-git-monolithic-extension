import assert from "node:assert";
import { execFile } from "node:child_process";
import { appendFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { promisify } from "node:util";
import type { Locator, Page } from "playwright-core";
import { setLocalConfig } from "./git.js";
import {
    closeOutputPanel,
    connect,
    createScenario,
    filteredOutputPanelText,
    LOAD_TIMEOUT_MS,
    notification,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    runCommand,
    scmView,
    showGitOutput,
    traceGitOutput,
    workspaceDir,
} from "./harness.js";

/** Set by `fixtures/untracked-timeout.sh`. */
const TIMED_OUT = /Reading the status of '.+' took longer than the git command timeout \(5s\)/u;

/** The last frame of a failed status read's logged stack. */
const FAILED_READ = "readWorkingTreeStatus (";

/** How a timed out git invocation is traced; here only status reads time out. */
const TIMED_OUT_CALL = ") ERROR_TIMEOUT";

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

/** Opening a FIFO with no writer blocks, so the untracked walk, which reads every ignore file, hangs. */
async function blockUntrackedWalk(): Promise<void> {
    await rm(blockingIgnoreFile());
    // Node cannot create a FIFO itself (https://github.com/nodejs/node/issues/38344), so this runs the system tool.
    await promisify(execFile)("mkfifo", [blockingIgnoreFile()]);
}

async function unblockUntrackedWalk(): Promise<void> {
    await rm(blockingIgnoreFile());
    await writeFile(blockingIgnoreFile(), "");
}

/** How many git invocations have timed out. Reveal the git log with `showGitOutput` first. */
async function timedOutCalls(): Promise<number> {
    const rendered = await filteredOutputPanelText(page, "< FAILED");
    return rendered.split(TIMED_OUT_CALL).length - 1;
}

scenario("tracked, staged and untracked changes are listed", async () => {
    await traceGitOutput(page);
    const view = await openScmView(page);

    await resourceRow(view, "tracked.txt").waitFor({ state: "visible" });
    await resourceRow(view, "staged.txt").waitFor({ state: "visible" });
    await resourceRow(view, "untracked.txt").waitFor({ state: "visible" });
});

scenario("a status read that times out flags every group, which keep their last known changes", async () => {
    const view = scmView(page);

    await blockUntrackedWalk();
    await runCommand(page, "Git: Refresh");

    await notification(page, TIMED_OUT).waitFor({ state: "visible", timeout: 20_000 });
    for (const group of ["Staged", "Tracked", "Untracked"]) {
        await groupName(view, `${group} \\(refresh failed\\)`).waitFor({ state: "visible" });
    }
    await resourceRow(view, "tracked.txt").waitFor({ state: "visible" });
    await resourceRow(view, "staged.txt").waitFor({ state: "visible" });
    await resourceRow(view, "untracked.txt").waitFor({ state: "visible" });
});

scenario("the notification opens the git log, which holds the failure", async () => {
    await notification(page, TIMED_OUT).getByRole("button", { name: "Open Git Log" }).click();

    // The panel renders the tail of the multi-line entry, which holds the stack of the failed read.
    await filteredOutputPanelText(page, FAILED_READ);
    await notification(page, TIMED_OUT).waitFor({ state: "hidden" });
});

scenario("a status read that keeps failing does not notify again", async () => {
    const before = await timedOutCalls();
    await appendFile(join(workspaceDir(), "other.txt"), "modified\n");
    await runCommand(page, "Git: Refresh");

    await pollUntil("the next read to time out", timedOutCalls, count => count > before, 20_000);
    await closeOutputPanel(page);
    await groupName(scmView(page), "Tracked \\(refresh failed\\)").waitFor({ state: "visible" });
    assert.strictEqual(await notification(page, TIMED_OUT).count(), 0);
    // Still the last known changes, from before `other.txt` was modified.
    assert.strictEqual(await resourceRow(scmView(page), "other.txt").count(), 0);
});

scenario("once the status can be read again, every change is listed and no group is flagged", async () => {
    const view = scmView(page);

    await unblockUntrackedWalk();
    await runCommand(page, "Git: Refresh");

    await resourceRow(view, "other.txt").waitFor({ state: "visible", timeout: 20_000 });
    for (const group of ["Staged", "Tracked", "Untracked"]) {
        await groupName(view, group).waitFor({ state: "visible" });
    }
    await resourceRow(view, "untracked.txt").waitFor({ state: "visible" });
});

scenario("a status read failing after one succeeded notifies again", async () => {
    await blockUntrackedWalk();
    await runCommand(page, "Git: Refresh");

    await notification(page, TIMED_OUT).waitFor({ state: "visible", timeout: 20_000 });
    await groupName(scmView(page), "Tracked \\(refresh failed\\)").waitFor({ state: "visible" });
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
    await unblockUntrackedWalk();
    await runCommand(page, "Git: Refresh");
    await groupName(view, "Tracked").waitFor({ state: "visible", timeout: 20_000 });

    await blockUntrackedWalk();
    const started = Date.now();
    await runCommand(page, "Git: Refresh");

    await notification(page, /took longer than the git command timeout \(1s\)/u).waitFor({ state: "visible" });
    // Well short of the 5s the read would take under the previous timeout.
    assert.ok(Date.now() - started < 4_000, `the read took ${Date.now() - started}ms to time out`);
});

scenario("listing every untracked file, as status.showUntrackedFiles=all asks, fails and recovers alike", async () => {
    const view = scmView(page);
    const timedOut = /Reading the status of '.+' took longer than the git command timeout \(1s\)/u;

    // The previous scenario's notification reads the same.
    await runCommand(page, "Notifications: Clear All Notifications");
    await notification(page, timedOut).waitFor({ state: "hidden" });

    await setLocalConfig("status.showUntrackedFiles", "all");
    await unblockUntrackedWalk();
    await runCommand(page, "Git: Refresh");
    await groupName(view, "Untracked").waitFor({ state: "visible", timeout: 20_000 });
    await resourceRow(view, "untracked.txt").waitFor({ state: "visible" });

    await blockUntrackedWalk();
    await runCommand(page, "Git: Refresh");

    await notification(page, timedOut).waitFor({ state: "visible", timeout: 20_000 });
    await groupName(view, "Untracked \\(refresh failed\\)").waitFor({ state: "visible" });
});
