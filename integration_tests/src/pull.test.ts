import assert from "node:assert";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { headSubject, pushUnrelatedUpstreamCommit } from "./git.js";
import {
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    notification,
    openScmView,
    openWorkbench,
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
