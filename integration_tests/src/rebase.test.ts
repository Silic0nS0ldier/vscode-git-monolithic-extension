import assert from "node:assert";
import { watch } from "node:fs";
import { mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { headSubject, setLocalConfig, symbolicHead, userGit } from "./git.js";
import {
    connect,
    createScenario,
    groupCount,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    runCommand,
    scmView,
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

let settingsRevision = 0;

async function applySettings(settings: Record<string, unknown>): Promise<void> {
    const file = join(workspaceDir(), ".vscode", "settings.json");
    await mkdir(dirname(file), { recursive: true });
    const title = `rebase settings ${++settingsRevision}`;
    await writeFile(file, JSON.stringify({ ...settings, "window.title": title }));
    await pollUntil("the workbench to apply workspace settings", () => page.title(), text => text === title);
}

scenario("an external multi-commit rebase completes while auto-refreshes fire mid-rebase", async () => {
    await openScmView(page);
    await applySettings({
        "git_monolithic.autorefreshCooldown": 0,
        "git_monolithic.autorefreshDebounce": 20,
    });

    // Pause past the 500ms watcher debounce midway so auto-refresh runs while rebase-merge is active.
    await userGit(
        "rebase",
        "--exec",
        "test ! -f file-5.txt || grep -q 'step 5' file-5.txt && sleep 0.7 || true",
        "base",
    );

    await pollUntil("HEAD to stay on main after rebase", symbolicHead, ref => ref === "refs/heads/main");
    assert.strictEqual(await headSubject(), "Commit 10");
});

scenario("refreshing during a rebase never creates index.lock or rewrites .git/index", async () => {
    const view = scmView(page);

    await userGit("switch", "conflicting");
    await assert.rejects(userGit("rebase", "base"), /CONFLICT|Could not apply/u);

    // Dirty a tracked file's stat entry so an unlocked `git status` would rewrite `.git/index`.
    const future = new Date(Date.now() + 60_000);
    await utimes(join(workspaceDir(), "file-1.txt"), future, future);
    const indexPath = join(workspaceDir(), ".git", "index");
    const beforeIno = (await stat(indexPath)).ino;

    const lockEvents: string[] = [];
    const dotGitMonitor = watch(join(workspaceDir(), ".git"), (_event, filename) => {
        if (filename === "index.lock") {
            lockEvents.push(filename);
        }
    });
    try {
        await runCommand(page, "Git: Refresh");

        await groupCount(view, "Merge").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });
        await resourceRow(view, "conflict.txt").waitFor({ state: "visible" });

        const afterIno = (await stat(indexPath)).ino;
        assert.deepStrictEqual(lockEvents, [], "refresh created index.lock while rebase was in progress");
        assert.strictEqual(afterIno, beforeIno, "refresh rewrote .git/index while rebase was in progress");
    } finally {
        dotGitMonitor.close();
    }

    await writeFile(join(workspaceDir(), "conflict.txt"), "resolved\n");
    await userGit("add", "--", "conflict.txt");
    await userGit("rebase", "--continue");

    await pollUntil("conflicting branch to finish rebasing", symbolicHead, ref => ref === "refs/heads/conflicting");
    assert.strictEqual(await headSubject(), "Conflicting change");
    await resourceRow(view, "conflict.txt").waitFor({ state: "detached" });
});

scenario("once no operation is in progress, refreshes save the untracked cache again", async () => {
    const view = scmView(page);

    await userGit("update-index", "--no-untracked-cache");
    await setLocalConfig("core.untrackedCache", "true");

    const freshPath = join(workspaceDir(), "after-rebase", "fresh.txt");
    await mkdir(dirname(freshPath), { recursive: true });
    await writeFile(freshPath, "fresh\n");

    await resourceRow(view, "fresh.txt").waitFor({ state: "visible" });
    await pollUntil(
        "git to save its untracked cache once rebase is finished",
        () => readFile(join(workspaceDir(), ".git", "index")),
        index => index.includes("UNTR"),
    );
});
