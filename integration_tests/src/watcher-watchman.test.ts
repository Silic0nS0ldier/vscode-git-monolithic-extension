import * as assert from "node:assert";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { promisify } from "node:util";
import type { Page } from "playwright-core";
import { status, userGit } from "./git.js";
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
    testTmpDir,
    traceGitOutput,
    workspaceDir,
} from "./harness.js";

const execFileAsync = promisify(execFile);

let browser: Awaited<ReturnType<typeof connect>>;
let page: Page;

before(async () => {
    browser = await connect();
    page = await openWorkbench(browser);
}, { timeout: LOAD_TIMEOUT_MS });

after(async () => {
    try {
        await browser.close();
    } finally {
        const watchman = (await readFile(join(testTmpDir(), "watchman-bin"), "utf8")).trim();
        const stateDir = (await readFile(join(testTmpDir(), "watchman-state-dir"), "utf8")).trim();
        try {
            await execFileAsync(watchman, ["shutdown-server"], {
                env: {
                    ...process.env,
                    HOME: join(testTmpDir(), "code-server"),
                    XDG_STATE_HOME: stateDir,
                },
                timeout: 10_000,
            });
        } finally {
            await rm(stateDir, { force: true, recursive: true });
        }
    }
});

const scenario = createScenario(() => page);

scenario("Watchman refreshes an external working tree change", async () => {
    const view = await openScmView(page);
    await traceGitOutput(page);

    await writeFile(join(workspaceDir(), "created.txt"), "created\n");

    await resourceRow(view, "created.txt").waitFor({ state: "visible" });
    assert.deepStrictEqual(await status(), { "created.txt": "??" });

    await showGitOutput(page);
    assert.match(await filteredOutputPanelText(page, "Watchman watcher delivered"), /Watchman watcher delivered/u);
    await closeOutputPanel(page);
});

scenario("Watchman refreshes an external index change", async () => {
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
