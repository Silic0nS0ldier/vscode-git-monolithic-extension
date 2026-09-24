import assert from "node:assert";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { subjectOf } from "./git.js";
import {
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
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

async function trackingSubject(branch: string): Promise<string> {
    return await subjectOf(`refs/remotes/origin/${branch}`);
}

scenario("autofetch of main and current advances only the default and current branches", async () => {
    await openScmView(page);

    await pollUntil(
        "origin/main and origin/feature to pick up their upstream commits",
        async () => [await trackingSubject("main"), await trackingSubject("feature")],
        ([main, feature]) => main === "Upstream main" && feature === "Upstream feature",
    );

    assert.strictEqual(await trackingSubject("topic"), "Base");
    assert.strictEqual(await trackingSubject("untracked"), "Base");
});

scenario("autofetch of tracked branches advances every tracked branch, past one the remote dropped", async () => {
    await writeFile(
        join(workspaceDir(), ".vscode", "settings.json"),
        JSON.stringify({ "git_monolithic.autofetch": "tracked", "git_monolithic.autofetchPeriod": 1 }),
    );

    await pollUntil(
        "origin/topic to pick up its upstream commit",
        async () => await trackingSubject("topic"),
        subject => subject === "Upstream topic",
    );

    assert.strictEqual(await trackingSubject("untracked"), "Base");
    // Nothing asked for a prune, so the ref the remote dropped is left as it was.
    assert.strictEqual(await trackingSubject("retired"), "Base");
});
