import assert from "node:assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, before } from "node:test";
import type { Locator, Page } from "playwright-core";
import { status } from "./git.js";
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
    runCommand,
    scmView,
    workspaceDir,
} from "./harness.js";

/** Row labels of the untracked files `fixtures/untracked.sh` writes. `lib` is the nested repository `vendor/lib`. */
const INITIAL = [
    "root.txt",
    "beside.txt",
    ".gitignore",
    "a.txt",
    "b.txt",
    "lib",
    "bad.txt",
    "colon.txt",
    "magic.txt",
    "star.txt",
    "brackets.txt",
    "dash.txt",
    "space.txt",
    "unicode.txt",
    "ab.txt",
    "upper.txt",
];

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

async function write(relativePath: string, content: string): Promise<void> {
    const path = join(workspaceDir(), relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
}

async function untrackedCount(view: Locator, count: number): Promise<void> {
    await groupCount(view, "Untracked").filter({ hasText: new RegExp(`^${count}$`, "u") }).waitFor({
        state: "visible",
    });
}

scenario("every untracked file is listed, including those inside wholly untracked folders", async () => {
    const view = await openScmView(page);

    await untrackedCount(view, INITIAL.length);
    for (const label of INITIAL) {
        await resourceRow(view, label).waitFor({ state: "visible" });
    }
    // Ignored-only and empty folders contribute nothing, which the count already shows.
    assert.strictEqual(await resourceRow(view, "only.log").count(), 0);
});

scenario("a file added inside a wholly untracked folder is listed", async () => {
    const view = scmView(page);

    await write("new/deep/c.txt", "c\n");

    await resourceRow(view, "c.txt").waitFor({ state: "visible" });
    await untrackedCount(view, INITIAL.length + 1);
});

scenario("the files of a new untracked folder are listed", async () => {
    const view = scmView(page);

    await write("fresh/nested/fresh.txt", "fresh\n");

    await resourceRow(view, "fresh.txt").waitFor({ state: "visible" });
    await untrackedCount(view, INITIAL.length + 2);
});

scenario("deleting the last file of an untracked folder removes it from the list", async () => {
    const view = scmView(page);

    await rm(join(workspaceDir(), "fresh", "nested", "fresh.txt"));

    await resourceRow(view, "fresh.txt").waitFor({ state: "detached" });
    await untrackedCount(view, INITIAL.length + 1);
});

scenario("a pattern added to an ignore file inside an untracked folder hides what it matches", async () => {
    const view = scmView(page);

    await write("new/.gitignore", "deep/\n");

    await resourceRow(view, "b.txt").waitFor({ state: "detached" });
    await resourceRow(view, "c.txt").waitFor({ state: "detached" });
    await untrackedCount(view, INITIAL.length - 1);
});

scenario("a file written as a refresh starts is listed", async () => {
    const view = scmView(page);

    // Whether the write lands before, during or after the refresh's git calls, a watcher event
    // follows it, and that event schedules a refresh of its own.
    await runCommand(page, "Git: Refresh");
    await write("new/late.txt", "late\n");

    await resourceRow(view, "late.txt").waitFor({ state: "visible" });
    await untrackedCount(view, INITIAL.length);
});

scenario("staging a file from a wholly untracked folder stages only that file", async () => {
    const view = scmView(page);

    await invokeRowAction(view, "a.txt", "Stage Changes");

    const current = await pollUntil("new/a.txt to be staged", status, s => s["new/a.txt"] === "A ");
    assert.strictEqual(current["new/late.txt"], "??");
    await groupCount(view, "Staged").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });
    await untrackedCount(view, INITIAL.length - 1);
});
