import assert from "node:assert";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { Page } from "playwright-core";
import { status } from "./git.js";
import {
    connect,
    createScenario,
    dialog,
    invokeRowAction,
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

scenario("deleting a file deleted by them stages the deletion and removes it from the work tree", async () => {
    const view = await openScmView(page);
    assert.deepStrictEqual(await status(), {
        "deleted-by-them.txt": "UD",
        "nested/deleted-by-us.txt": "DU",
    });

    await invokeRowAction(view, "deleted-by-them.txt", "Stage Changes");

    const prompt = dialog(page, /was deleted by them and modified by us/u);
    await prompt.getByRole("button", { name: "Delete File" }).click();

    await pollUntil(
        "the deletion to be staged",
        status,
        current => isDeepStrictEqual(current, { "deleted-by-them.txt": "D ", "nested/deleted-by-us.txt": "DU" }),
    );
    await assert.rejects(access(join(workspaceDir(), "deleted-by-them.txt")), { code: "ENOENT" });
});

scenario("deleting a nested file deleted by us drops it from the index and the work tree", async () => {
    const view = await openScmView(page);

    await invokeRowAction(view, "deleted-by-us.txt", "Stage Changes");

    const prompt = dialog(page, /was deleted by us and modified by them/u);
    await prompt.getByRole("button", { name: "Delete File" }).click();

    await pollUntil(
        "the conflict to be resolved",
        status,
        current => isDeepStrictEqual(current, { "deleted-by-them.txt": "D " }),
    );
    await assert.rejects(access(join(workspaceDir(), "nested", "deleted-by-us.txt")), { code: "ENOENT" });
});
