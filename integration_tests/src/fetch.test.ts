import assert from "node:assert";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { resolveRef, subjectOf } from "./git.js";
import {
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    runCommand,
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

const ORIGIN_MAIN = "refs/remotes/origin/main";
const ORIGIN_RETIRED = "refs/remotes/origin/retired";
const SECONDARY_MAIN = "refs/remotes/secondary/main";

scenario("fetching advances the tracking ref of the default remote", async () => {
    await openScmView(page);

    assert.strictEqual(await subjectOf(ORIGIN_MAIN), "Base");

    await runCommand(page, "Git: Fetch");

    await pollUntil(
        "origin/main to pick up the upstream commit",
        async () => await subjectOf(ORIGIN_MAIN),
        subject => subject === "Upstream change",
    );

    // Only the default remote is contacted, and nothing is pruned without being asked.
    assert.notStrictEqual(await resolveRef(ORIGIN_RETIRED), undefined);
    assert.strictEqual(await resolveRef(SECONDARY_MAIN), undefined);
});

scenario("fetching with prune drops tracking refs the remote no longer has", async () => {
    await runCommand(page, "Git: Fetch (Prune)");

    await pollUntil(
        "origin/retired to be pruned",
        async () => await resolveRef(ORIGIN_RETIRED),
        ref => ref === undefined,
    );

    assert.strictEqual(await resolveRef(SECONDARY_MAIN), undefined);
});

scenario("fetching from all remotes reaches a remote the branch does not track", async () => {
    await runCommand(page, "Git: Fetch From All Remotes");

    await pollUntil(
        "secondary/main to appear",
        async () => await resolveRef(SECONDARY_MAIN),
        ref => ref !== undefined,
    );
});
