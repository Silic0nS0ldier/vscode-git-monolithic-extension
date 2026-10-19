import assert from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import {
    headSubject,
    markPushesToOrigin,
    pushUnrelatedUpstreamCommit,
    pushUnrelatedUpstreamCommitUnfetched,
    resolveRef,
} from "./git.js";
import {
    connect,
    createScenario,
    dialog,
    LOAD_TIMEOUT_MS,
    notification,
    openScmView,
    openWorkbench,
    pollUntil,
    runCommand,
    testTmpDir,
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

scenario("pulling a branch that looks rebased warns before pulling", async () => {
    await openScmView(page);

    await runCommand(page, "Git: Pull");

    // The upstream carries a commit with the same patch as the local-only one, the way a
    // rebase-and-force-push leaves things; `checkIfMaybeRebased` asks before pulling rather
    // than risking a duplicate merge.
    const warning = notification(page, /might have been rebased/u);
    await warning.waitFor({ state: "visible" });

    await warning.getByRole("button", { name: "Don't Pull" }).click();
    await warning.waitFor({ state: "hidden" });

    // Declining left the local commit untouched.
    assert.strictEqual(await headSubject(), "Local pending change");
});

scenario("the warning still fires once the equivalent commit is no longer the newest", async () => {
    // A genuinely unrelated commit now sits ahead of the equivalent one, so detection has to
    // look past the first entry `--cherry` reports.
    await pushUnrelatedUpstreamCommit();

    await runCommand(page, "Git: Pull");

    const warning = notification(page, /might have been rebased/u);
    await warning.waitFor({ state: "visible" });

    await warning.getByRole("button", { name: "Don't Pull" }).click();
    await warning.waitFor({ state: "hidden" });

    assert.strictEqual(await headSubject(), "Local pending change");
});

scenario("declining the warning during sync skips the push as well as the pull", async () => {
    // Left unfetched so the extension's own fetch below is observable.
    const upstreamTip = await pushUnrelatedUpstreamCommitUnfetched();
    const pushed = join(testTmpDir(), "pushed-during-sync");
    await markPushesToOrigin(pushed);

    await runCommand(page, "Git: Sync");

    const confirm = dialog(page, /will push and pull commits/u);
    await confirm.getByRole("button", { exact: true, name: "OK" }).click();

    const warning = notification(page, /might have been rebased/u);
    await warning.waitFor({ state: "visible" });
    await warning.getByRole("button", { name: "Don't Pull" }).click();
    await warning.waitFor({ state: "hidden" });

    // Remote operations run one at a time, so once this fetch lands any push the sync went on to make has finished.
    // A push that does happen fails (the branches diverged) and its error UI can get in the way of this fetch, so the
    // check runs regardless to report the real cause.
    try {
        await runCommand(page, "Git: Fetch");
        await pollUntil("origin/main to be fetched", () => resolveRef("origin/main"), ref => ref === upstreamTip);
    } finally {
        assert.strictEqual(existsSync(pushed), false, "sync pushed after the pull was declined");
    }
    assert.strictEqual(await headSubject(), "Local pending change");
});
