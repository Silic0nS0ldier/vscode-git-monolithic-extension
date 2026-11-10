import assert from "node:assert";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { Page } from "playwright-core";
import { commitIn, status } from "./git.js";
import {
    connect,
    createScenario,
    dialog,
    invokeRowAction,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
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

async function discard(name: string): Promise<void> {
    const view = await openScmView(page);
    await invokeRowAction(view, name, "Discard Changes");
    const prompt = dialog(page, new RegExp(`Are you sure you want to discard changes in ${name}\\?`, "u"));
    await prompt.getByRole("button", { name: "Discard Changes" }).click();
}

scenario("discarding a submodule's changes checks out the recorded commit", async () => {
    assert.deepStrictEqual(await status(), { "libs/other": " M", "sub": " M" });
    const recorded = await commitIn("sub", "main~1");

    await discard("sub");

    await pollUntil("sub to be back on its recorded commit", () => commitIn("sub", "HEAD"), c => c === recorded);
    await pollUntil("only libs/other to remain modified", status, s => isDeepStrictEqual(s, { "libs/other": " M" }));
    assert.strictEqual(await commitIn("libs/other", "HEAD"), await commitIn("libs/other", "main"));
});

scenario("discarding a nested submodule's changes checks out its recorded commit", async () => {
    const recorded = await commitIn("libs/other", "main~1");

    await discard("other");

    await pollUntil(
        "libs/other to be back on its recorded commit",
        () => commitIn("libs/other", "HEAD"),
        c => c === recorded,
    );
    await pollUntil("the work tree to be clean", status, s => isDeepStrictEqual(s, {}));
});

scenario("a file created inside a submodule does not list the submodule as changed", async () => {
    const view = await openScmView(page);

    await writeFile(join(workspaceDir(), "sub", "untracked-in-sub.txt"), "untracked\n");
    // Written second, so the refresh that lists it has seen the submodule's new file too.
    await writeFile(join(workspaceDir(), "marker.txt"), "marker\n");

    // Plain `git status` counts untracked content as a change to the submodule; the extension does not.
    assert.deepStrictEqual(await pollUntil("git to see both files", status, s => "marker.txt" in s), {
        "marker.txt": "??",
        "sub": " M",
    });
    await resourceRow(view, "marker.txt").waitFor({ state: "visible" });
    assert.strictEqual(await resourceRow(view, "sub").count(), 0);
});
