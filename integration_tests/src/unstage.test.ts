import assert from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { Page } from "playwright-core";
import { resolveRef, status } from "./git.js";
import {
    connect,
    createScenario,
    groupCount,
    invokeGroupAction,
    invokeRowAction,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    runCommand,
    scmInputText,
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

scenario("unstaging one file returns only that file to the work tree", async () => {
    const view = await openScmView(page);
    assert.deepStrictEqual(await status(), {
        "added.txt": "A ",
        "both.txt": "MM",
        "modified.txt": "M ",
        "untracked.txt": "??",
    });

    await invokeRowAction(view, "modified.txt", "Unstage Changes");

    await pollUntil(
        "modified.txt to leave the index",
        status,
        current =>
            isDeepStrictEqual(current, {
                "added.txt": "A ",
                "both.txt": "MM",
                "modified.txt": " M",
                "untracked.txt": "??",
            }),
    );
    assert.strictEqual(await readFile(join(workspaceDir(), "modified.txt"), "utf8"), "committed\nstaged\n");
});

scenario("unstaging all changes empties the index and keeps the work tree", async () => {
    const view = await openScmView(page);
    await groupCount(view, "Staged").filter({ hasText: /^2$/u }).waitFor({ state: "visible" });

    await invokeGroupAction(view, "Staged", "Unstage All Changes");

    await pollUntil(
        "the index to match HEAD",
        status,
        current =>
            isDeepStrictEqual(current, {
                "added.txt": "??",
                "both.txt": " M",
                "modified.txt": " M",
                "untracked.txt": "??",
            }),
    );
    assert.strictEqual(await readFile(join(workspaceDir(), "both.txt"), "utf8"), "committed\nstaged\nunstaged\n");
});

scenario("undoing the root commit deletes the branch and untracks everything it committed", async () => {
    const view = await openScmView(page);
    // `rm --cached` refuses a file whose work tree differs from the index once there is no HEAD.
    for (const name of ["both.txt", "modified.txt"]) {
        await writeFile(join(workspaceDir(), name), "committed\n");
    }
    await pollUntil(
        "the committed files to be clean",
        status,
        current => isDeepStrictEqual(current, { "added.txt": "??", "untracked.txt": "??" }),
    );

    await runCommand(page, "Git: Undo Last Commit");

    assert.strictEqual(
        await pollUntil("the commit message to be restored", () => scmInputText(view), text => text !== ""),
        "Root commit Root body line",
    );
    await pollUntil(
        "every file to be untracked",
        status,
        current =>
            isDeepStrictEqual(current, {
                "added.txt": "??",
                "both.txt": "??",
                "modified.txt": "??",
                "untracked.txt": "??",
            }),
    );
    assert.strictEqual(await resolveRef("HEAD"), undefined);
    assert.strictEqual(await resolveRef("refs/heads/main"), undefined);
    assert.strictEqual(await readFile(join(workspaceDir(), "modified.txt"), "utf8"), "committed\n");
});

scenario("unstaging a file before the first commit drops it from the index", async () => {
    const view = await openScmView(page);

    await invokeRowAction(view, "added.txt", "Stage Changes");
    await pollUntil("added.txt to be staged", status, current => current["added.txt"] === "A ");
    await invokeRowAction(view, "both.txt", "Stage Changes");
    await pollUntil("both.txt to be staged", status, current => current["both.txt"] === "A ");
    await groupCount(view, "Staged").filter({ hasText: /^2$/u }).waitFor({ state: "visible" });

    await invokeRowAction(view, "added.txt", "Unstage Changes");

    await pollUntil(
        "added.txt to leave the index",
        status,
        current =>
            isDeepStrictEqual(current, {
                "added.txt": "??",
                "both.txt": "A ",
                "modified.txt": "??",
                "untracked.txt": "??",
            }),
    );
    assert.strictEqual(await readFile(join(workspaceDir(), "added.txt"), "utf8"), "added\n");
});
