import * as assert from "node:assert";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { status, userGit } from "./git.js";
import {
    connect,
    createScenario,
    groupCount,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
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

scenario("the VS Code watcher refreshes an external working tree change", async () => {
    const view = await openScmView(page);

    await writeFile(join(workspaceDir(), "created.txt"), "created\n");

    await resourceRow(view, "created.txt").waitFor({ state: "visible" });
    assert.deepStrictEqual(await status(), { "created.txt": "??" });
});

scenario("the VS Code watcher refreshes an external index change", async () => {
    const view = scmView(page);

    await userGit("add", "--", "created.txt");
    await groupCount(view, "Staged").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });

    assert.deepStrictEqual(
        await pollUntil("created.txt to be staged", status, current => current["created.txt"] === "A "),
        { "created.txt": "A " },
    );

    await userGit("reset", "--", "created.txt");
    await groupCount(view, "Staged").filter({ hasText: /^0$/u }).waitFor({ state: "visible" });
    await groupCount(view, "Untracked").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });
});
