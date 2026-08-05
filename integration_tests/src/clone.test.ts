import assert from "node:assert";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { capture, fixtureDir, LOAD_TIMEOUT_MS, openEditor, runCommand } from "./helpers.js";

/** Polls until `predicate` holds, since the clone runs asynchronously in the editor. */
async function waitFor(predicate: () => Promise<boolean>, description: string): Promise<void> {
    const deadline = Date.now() + LOAD_TIMEOUT_MS;

    while (Date.now() < deadline) {
        if (await predicate()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    assert.fail(`timed out waiting for ${description}`);
}

test("the clone command clones a repository into the chosen directory", {
    timeout: LOAD_TIMEOUT_MS * 2,
}, async () => {
    // A local path works as a git URL and keeps the test off the network.
    const source = fixtureDir("clone-source");
    const target = fixtureDir("clone-target");
    const cloned = join(target, "clone-source");

    const { close, page } = await openEditor();

    try {
        await runCommand(page, "Git: Clone");

        // Prompt one: the repository URL.
        const quickInput = page.locator(".quick-input-widget");
        const urlInput = quickInput.locator(".quick-input-box input");
        await urlInput.waitFor({ state: "visible" });
        await urlInput.fill(source);
        await page.keyboard.press("Enter");

        // Prompt two: the parent directory. VS Code for the web has no native dialogs,
        // so `showOpenDialog` renders as another quick input.
        const pathInput = quickInput.locator(".quick-input-box input");
        await pathInput.waitFor({ state: "visible" });
        await pathInput.fill(`${target}/`);
        await page.keyboard.press("Enter");

        await waitFor(
            async () => {
                try {
                    return (await readdir(cloned)).includes(".git");
                } catch {
                    return false;
                }
            },
            `a git repository to appear at ${cloned}`,
        );

        const entries = await readdir(cloned);
        assert.ok(entries.includes("tracked.txt"), `expected the cloned tree to contain tracked.txt, got ${entries}`);

        await capture(page, "clone");
    } catch (error) {
        await capture(page, "clone-failure");
        throw error;
    } finally {
        await close();
    }
});
