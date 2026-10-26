import assert from "node:assert";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { Page } from "playwright-core";
import { localConfig, resolveRef, shortCommit, status, symbolicHead } from "./git.js";
import {
    connect,
    createScenario,
    dialog,
    groupCount,
    invokeRowAction,
    LOAD_TIMEOUT_MS,
    openPickerFromStatusBar,
    openScmView,
    openWorkbench,
    pickerRow,
    pickerRowLabels,
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

const PICKER = "Select a ref to checkout";
const LOCAL_CHANGES = /Your local changes would be overwritten by checkout\./u;

function contents(name: string): Promise<string> {
    return readFile(join(workspaceDir(), name), "utf8");
}

// Driven from the status bar because the builtin git extension contributes a command with the
// same palette label as this one. The label marks the untracked file with a `*`.
async function pickRef(headLabel: string, ref: string): Promise<void> {
    const picker = await openPickerFromStatusBar(page, headLabel, PICKER);
    await pickerRow(picker, ref).click();
}

scenario("discarding changes to a tracked file restores it", async () => {
    const view = await openScmView(page);
    assert.deepStrictEqual(await status(), {
        "deleted.txt": " D",
        "modified.txt": " M",
        "shared.txt": " M",
        "untracked.txt": "??",
    });

    await invokeRowAction(view, "modified.txt", "Discard Changes");
    const prompt = dialog(page, /Are you sure you want to discard changes in modified\.txt\?/u);
    await prompt.getByRole("button", { name: "Discard Changes" }).click();

    await pollUntil(
        "modified.txt to be restored",
        status,
        current => isDeepStrictEqual(current, { "deleted.txt": " D", "shared.txt": " M", "untracked.txt": "??" }),
    );
    assert.strictEqual(await contents("modified.txt"), "committed\n");
});

scenario("restoring a deleted tracked file brings it back", async () => {
    const view = await openScmView(page);
    // Acting before the list drops modified.txt would click a row that is being re-rendered.
    await groupCount(view, "Tracked").filter({ hasText: /^2$/u }).waitFor({ state: "visible" });

    await invokeRowAction(view, "deleted.txt", "Discard Changes");
    const prompt = dialog(page, /Are you sure you want to restore deleted\.txt\?/u);
    await prompt.getByRole("button", { name: "Restore file" }).click();

    await pollUntil(
        "deleted.txt to be restored",
        status,
        current => isDeepStrictEqual(current, { "shared.txt": " M", "untracked.txt": "??" }),
    );
    assert.strictEqual(await contents("deleted.txt"), "committed\n");
});

scenario(
    "checking out a branch that would overwrite local changes asks first, and cancelling leaves them",
    async () => {
        await pickRef("main*", "topic");

        // The prompt only appears once the failure has been recognised as a dirty work tree.
        const prompt = dialog(page, LOCAL_CHANGES);
        await prompt.waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await prompt.waitFor({ state: "hidden" });

        assert.strictEqual(await symbolicHead(), "refs/heads/main");
        assert.strictEqual(await contents("shared.txt"), "local\n");
        assert.deepStrictEqual(await status(), { "shared.txt": " M", "untracked.txt": "??" });
    },
);

scenario("forcing the checkout discards the conflicting change and switches branch", async () => {
    await pickRef("main*", "topic");

    await dialog(page, LOCAL_CHANGES).getByRole("button", { name: "Force Checkout" }).click();
    const discard = dialog(page, /Are you sure you want to discard changes in shared\.txt\?/u);
    await discard.getByRole("button", { name: "Discard 1 File" }).click();

    await pollUntil("HEAD to be on topic", symbolicHead, ref => ref === "refs/heads/topic");
    assert.strictEqual(await contents("shared.txt"), "topic\n");
    assert.deepStrictEqual(await status(), { "untracked.txt": "??" });
});

scenario("checking out a remote branch creates a local branch tracking it", async () => {
    await pickRef("topic*", "origin/feature");

    await pollUntil("HEAD to be on feature", symbolicHead, ref => ref === "refs/heads/feature");
    assert.strictEqual(await resolveRef("HEAD"), await resolveRef("origin/feature"));
    assert.strictEqual(await localConfig("branch.feature.remote"), "origin");
    assert.strictEqual(await localConfig("branch.feature.merge"), "refs/heads/feature");
    await access(join(workspaceDir(), "feature.txt"));
});

scenario("checking out detached at a branch leaves HEAD on its commit", async () => {
    const picker = await openPickerFromStatusBar(page, "feature*", PICKER);
    // Accepted by keyboard: a click lets the follow-up picker open under the pointer and close again.
    const filter = picker.locator(`input[placeholder="${PICKER}"]`);
    // The extension host can still be pushing the picker's initial state, which clears the value.
    await pollUntil(
        "the filter to rank the detached entry first",
        async () => {
            if (await filter.inputValue() !== "Checkout detached") {
                await filter.fill("Checkout detached");
            }
            return pickerRowLabels(picker);
        },
        labels => labels[0] === "Checkout detached...",
    );
    await filter.press("Enter");
    await picker.locator(`input[placeholder="${PICKER} in detached mode"]`).waitFor({ state: "visible" });
    await pickerRow(picker, "main").click();

    await pollUntil("HEAD to be detached", symbolicHead, ref => ref === undefined);
    assert.strictEqual(await resolveRef("HEAD"), await resolveRef("main"));
    assert.deepStrictEqual(await status(), { "untracked.txt": "??" });
});

scenario("checking out a remote branch that is already tracked switches to the local branch", async () => {
    await pickRef(`${await shortCommit("main")}* (Detached)`, "origin/feature");

    await pollUntil("HEAD to be on feature", symbolicHead, ref => ref === "refs/heads/feature");
    assert.strictEqual(await resolveRef("HEAD"), await resolveRef("origin/feature"));
});
