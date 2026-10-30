import assert from "node:assert";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { Page } from "playwright-core";
import { status } from "./git.js";
import {
    closeAllEditors,
    connect,
    createScenario,
    dialog,
    LOAD_TIMEOUT_MS,
    openFile,
    openInputBox,
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

/** Renames the file open in the active editor, whose workspace-relative path is `from`, to `to`. */
async function renameActiveFile(from: string, to: string): Promise<void> {
    await closeAllEditors(page);
    await openFile(page, from);

    // The input box opens on the active file's path relative to the repository root.
    const input = await openInputBox(page, "Git: Rename", from);
    await input.fill(to);
    await input.press("Enter");
    await input.waitFor({ state: "hidden" });
}

async function exists(relativePath: string): Promise<boolean> {
    return access(join(workspaceDir(), relativePath)).then(() => true, () => false);
}

scenario("renaming a tracked file stages the rename", async () => {
    assert.deepStrictEqual(await status(), { "untracked.txt": "??" });

    await renameActiveFile("tracked.txt", "renamed.txt");

    await pollUntil(
        "the rename to be staged",
        status,
        current => isDeepStrictEqual(current, { "tracked.txt -> renamed.txt": "R ", "untracked.txt": "??" }),
    );
    assert.strictEqual(await exists("tracked.txt"), false);
    assert.strictEqual(await exists("renamed.txt"), true);
});

scenario("renaming a nested file moves it by its path relative to the repository root", async () => {
    await renameActiveFile("nested/inner.txt", "outer.txt");

    await pollUntil(
        "the move to be staged",
        status,
        current =>
            isDeepStrictEqual(current, {
                "nested/inner.txt -> outer.txt": "R ",
                "tracked.txt -> renamed.txt": "R ",
                "untracked.txt": "??",
            }),
    );
    assert.strictEqual(await exists("nested/inner.txt"), false);
    assert.strictEqual(await exists("outer.txt"), true);
});

scenario("renaming onto an existing file reports git's refusal and moves nothing", async () => {
    await renameActiveFile("existing.txt", "renamed.txt");

    const prompt = dialog(page, /Git: fatal: destination exists, source=existing\.txt, destination=renamed\.txt/u);
    await prompt.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await prompt.waitFor({ state: "hidden" });

    assert.deepStrictEqual(await status(), {
        "nested/inner.txt -> outer.txt": "R ",
        "tracked.txt -> renamed.txt": "R ",
        "untracked.txt": "??",
    });
    assert.strictEqual(await exists("existing.txt"), true);
});

scenario("renaming an untracked file reports git's refusal and moves nothing", async () => {
    await renameActiveFile("untracked.txt", "elsewhere.txt");

    const prompt = dialog(page, /Git: fatal: not under version control, source=untracked\.txt/u);
    await prompt.waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await prompt.waitFor({ state: "hidden" });

    assert.deepStrictEqual(await status(), {
        "nested/inner.txt -> outer.txt": "R ",
        "tracked.txt -> renamed.txt": "R ",
        "untracked.txt": "??",
    });
    assert.strictEqual(await exists("untracked.txt"), true);
    assert.strictEqual(await exists("elsewhere.txt"), false);
});
