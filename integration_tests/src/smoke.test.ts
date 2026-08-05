import test from "node:test";
import { capture, LOAD_TIMEOUT_MS, openEditor } from "./helpers.js";

test("the extension activates and reports working tree changes", { timeout: LOAD_TIMEOUT_MS * 2 }, async () => {
    const { close, page } = await openEditor();

    try {
        // The extension owns the only source control provider, so a populated SCM
        // view proves it activated, found the repository and ran git against it.
        await page.keyboard.press("Control+Shift+G");
        const scm = page.locator(".scm-view:not(.scm-history-view)").first();
        await scm.waitFor({ state: "visible" });

        // Exact matching: "tracked.txt" is a substring of "untracked.txt".
        for (const change of ["tracked.txt", "untracked.txt"]) {
            await scm.getByText(change, { exact: true }).first().waitFor({ state: "visible" });
        }

        await capture(page, "workbench");
    } catch (error) {
        await capture(page, "failure");
        throw error;
    } finally {
        await close();
    }
});
