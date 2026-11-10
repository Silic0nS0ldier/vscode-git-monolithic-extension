import assert from "node:assert";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, before } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Locator, Page } from "playwright-core";
import { setLocalConfig, status } from "./git.js";
import {
    closeOutputPanel,
    connect,
    createScenario,
    filteredOutputPanelText,
    groupCount,
    invokeRowAction,
    LOAD_TIMEOUT_MS,
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

/** The extension's defaults for `git_monolithic.autorefreshDebounce` and `git_monolithic.watcherDebounce`. */
const AUTOREFRESH_DEBOUNCE_MS = 1_000;
const WATCHER_DEBOUNCE_MS = 500;

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

/** The latest git invocation the output panel shows a line mentioning `text` for, by its sequence number. */
async function latestInvocation(text: string): Promise<number> {
    const rendered = await filteredOutputPanelText(page, text);
    return Math.max(...[...rendered.matchAll(/CMD_0_(\d+) > git/gu)].map(([, id]) => parseId(id)));
}

function parseId(id: string | undefined): number {
    assert.ok(id !== undefined && /^\d+$/u.test(id), `unexpected invocation id ${id}`);
    return [...id].reduce((value, digit) => value * 10 + digit.charCodeAt(0) - 48, 0);
}

scenario("a refresh reads the status git's untracked cache serves, and lists only collapsed folders", async () => {
    await traceGitOutput(page);
    await write("traced/traced.txt", "traced\n");
    await resourceRow(scmView(page), "traced.txt").waitFor({ state: "visible" });
    await showGitOutput(page);

    await filteredOutputPanelText(
        page,
        "> git -c diff.ignoreSubmodules=untracked status -z --porcelain=v2 --branch --untracked-files=normal",
    );
    await filteredOutputPanelText(page, "> git --literal-pathspecs ls-files -z --others --exclude-standard --");
});

scenario("once nothing changes, refreshes stop, even as git saves its untracked cache", async () => {
    // Saving the cache changes the index, which schedules one more refresh; that one changes nothing. Waiting past
    // both debounces with no new status read shows the refreshes have settled rather than looping.
    const before = await latestInvocation("--untracked-files=normal");
    await setLocalConfig("core.untrackedCache", "true");
    await write("cached/cached.txt", "cached\n");
    await resourceRow(scmView(page), "cached.txt").waitFor({ state: "visible" });
    assert.ok(await latestInvocation("--untracked-files=normal") > before, "the change was not refreshed");
    await pollUntil(
        "git to save its untracked cache",
        () => readFile(join(workspaceDir(), ".git", "index")),
        index => index.includes("UNTR"),
    );

    const quiet = AUTOREFRESH_DEBOUNCE_MS + WATCHER_DEBOUNCE_MS + 2_000;
    await pollUntil(
        "refreshes to stop",
        async () => {
            const before = await latestInvocation("--untracked-files=normal");
            await delay(quiet);
            return before === await latestInvocation("--untracked-files=normal");
        },
        settled => settled,
        30_000,
    );

    await closeOutputPanel(page);
});
