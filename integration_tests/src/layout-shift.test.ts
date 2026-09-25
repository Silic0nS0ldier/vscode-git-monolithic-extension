import assert from "node:assert";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Page } from "playwright-core";
import { status } from "./git.js";
import {
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    scmView,
    workspaceDir,
} from "./harness.js";

/** Matches `fixtures/layout-shift.sh`. */
const LAYOUT_SHIFT_DELAY_MS = 3_000;

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

/** The number on the Source Control activity bar entry. */
async function countBadge(): Promise<string> {
    const badge = page.locator(".activitybar .badge[aria-label^=\"Source Control\"] .badge-content");
    return (await badge.innerText()).trim();
}

async function expectCount(describe: string, count: string): Promise<void> {
    assert.strictEqual(await pollUntil(describe, countBadge, current => current === count), count);
}

scenario("the count includes a file the view is still holding back", async () => {
    const view = await openScmView(page);
    await resourceRow(view, "tracked.txt").waitFor({ state: "visible" });
    await expectCount("the initial count", "1");

    await writeFile(join(workspaceDir(), "created.txt"), "created\n");

    await expectCount("the count to include created.txt", "2");
    assert.strictEqual(
        await resourceRow(view, "created.txt").count(),
        0,
        "the view showed created.txt without holding it back, so this covers nothing",
    );
    await resourceRow(view, "created.txt").waitFor({ state: "visible" });
    assert.strictEqual(await countBadge(), "2");
});

scenario("a change undone while the view holds it back is not shown later", async () => {
    const view = scmView(page);

    await writeFile(join(workspaceDir(), "reverted.txt"), "reverted\n");
    await expectCount("the count to include reverted.txt", "3");
    await rm(join(workspaceDir(), "reverted.txt"));
    await expectCount("the count to drop reverted.txt", "2");

    // Outlast the hold-back the first change started, which must not apply once superseded.
    await delay(LAYOUT_SHIFT_DELAY_MS + 1_000);

    assert.strictEqual(await resourceRow(view, "reverted.txt").count(), 0, "a superseded refresh was applied");
    await resourceRow(view, "created.txt").waitFor({ state: "visible" });
    assert.strictEqual(await countBadge(), "2");
    assert.deepStrictEqual(await status(), { "created.txt": "??", "tracked.txt": " M" });
});
