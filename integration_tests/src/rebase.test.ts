import assert from "node:assert";
import { watch } from "node:fs";
import { mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { headSubject, setLocalConfig, symbolicHead, userGit } from "./git.js";
import {
    closeOutputPanel,
    connect,
    createScenario,
    filteredOutputPanelText,
    groupCount,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    scmView,
    showGitOutput,
    traceGitOutput,
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
        await groupCount(view, "Merge").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });
        await resourceRow(view, "conflict.txt").waitFor({ state: "visible" });

        const afterIno = (await stat(indexPath)).ino;
        assert.deepStrictEqual(lockEvents, [], "auto-refresh created index.lock while rebase was in progress");
        assert.strictEqual(afterIno, beforeIno, "auto-refresh rewrote .git/index while rebase was in progress");
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

function countStatusInvocations(rendered: string): number {
    return new Set([...rendered.matchAll(/CMD_0_(\d+) > git/gu)].map(([, id]) => id)).size;
}

scenario("rapid rebase steps coalesce into a trailing refresh instead of firing per commit", async () => {
    const view = scmView(page);
    await applySettings({
        "git_monolithic.autorefreshCooldown": 2_000,
        "git_monolithic.autorefreshDebounce": 1_000,
    });
    await traceGitOutput(page);

    // Seed one traced status so the output filter has a baseline line to match.
    await writeFile(join(workspaceDir(), "after-rebase", "seed.txt"), "seed\n");
    await resourceRow(view, "seed.txt").waitFor({ state: "visible" });
    await showGitOutput(page);
    const baseline = countStatusInvocations(await filteredOutputPanelText(page, "--untracked-files=normal"));

    // Replay all 10 commits of `main` onto `conflicting`'s base (`HEAD` on `conflicting` has 1 commit over `base`).
    await userGit("switch", "main");
    await userGit("rebase", "--onto", "conflicting", "base");
    await writeFile(join(workspaceDir(), "after-rebase", "settled.txt"), "settled\n");
    await resourceRow(view, "settled.txt").waitFor({ state: "visible" });

    const after = countStatusInvocations(await filteredOutputPanelText(page, "--untracked-files=normal"));
    // 10 commits + switch + settled file write coalesce into at most a couple of status reads, never one per commit.
    assert.ok(after - baseline <= 3, `expected coalesced refreshes, saw ${after - baseline} status calls`);

    await closeOutputPanel(page);
});

scenario(
    "a terminal merge conflict auto-refreshes SCM while MERGE_HEAD is present without taking index.lock",
    async () => {
        const view = scmView(page);
        await applySettings({
            "git_monolithic.autorefreshCooldown": 0,
            "git_monolithic.autorefreshDebounce": 100,
        });

        await userGit("switch", "--create", "merge-side", "base");
        await writeFile(join(workspaceDir(), "base-only.txt"), "merge-side\n");
        await userGit("commit", "--all", "--message", "Merge-side change");

        await userGit("switch", "main");
        await writeFile(join(workspaceDir(), "base-only.txt"), "main-side\n");
        await userGit("commit", "--all", "--message", "Main-side change");

        await assert.rejects(
            userGit("merge", "merge-side"),
            (err: { stdout?: string }) => typeof err.stdout === "string" && err.stdout.includes("CONFLICT"),
        );

        const lockEvents: string[] = [];
        const dotGitMonitor = watch(join(workspaceDir(), ".git"), (_event, filename) => {
            if (filename === "index.lock") {
                lockEvents.push(filename);
            }
        });
        try {
            await groupCount(view, "Merge").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });
            await resourceRow(view, "base-only.txt").waitFor({ state: "visible" });
            assert.deepStrictEqual(lockEvents, [], "auto-refresh created index.lock while MERGE_HEAD was present");
        } finally {
            dotGitMonitor.close();
        }

        await writeFile(join(workspaceDir(), "base-only.txt"), "merged\n");
        await userGit("add", "--", "base-only.txt");
        await groupCount(view, "Staged").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });

        await userGit("commit", "--no-edit");
        await resourceRow(view, "base-only.txt").waitFor({ state: "detached" });
    },
);
