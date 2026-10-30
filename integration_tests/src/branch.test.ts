import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { Locator, Page } from "playwright-core";
import { localConfig, resolveRef, status, symbolicHead } from "./git.js";
import {
    connect,
    createScenario,
    dialog,
    LOAD_TIMEOUT_MS,
    openPickerFromStatusBar,
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

/**
 * Types `name` into the checkout picker's filter and accepts the `entry` row, which hands the
 * filter text on as the new branch name. Driven from the status bar because the builtin git
 * extension contributes commands with the same palette labels. Accepted by keyboard: a click lets
 * a follow-up picker open under the pointer and close again.
 */
async function createFromPicker(headLabel: string, name: string, entry: string): Promise<Locator> {
    const picker = await openPickerFromStatusBar(page, headLabel, PICKER);
    const filter = picker.locator(`input[placeholder="${PICKER}"]`);
    // The extension host can still be pushing the picker's initial state, which clears the value.
    await pollUntil(
        `the filter to hold '${name}'`,
        async () => {
            if (await filter.inputValue() !== name) {
                await filter.fill(name);
            }
            return pickerRowLabels(picker);
        },
        labels => labels[0] === entry,
    );
    await filter.press("Enter");
    return picker;
}

/**
 * Accepts the `entry` row of the checkout picker with an empty filter, then names the branch in
 * the input box that follows.
 */
async function createNamed(headLabel: string, entry: string, name: string): Promise<Locator> {
    const picker = await openPickerFromStatusBar(page, headLabel, PICKER);
    const filter = picker.locator(`input[placeholder="${PICKER}"]`);
    const focused = picker.locator(".monaco-list-row.focused .label-name");
    // Keys pressed while the extension host is still pushing the picker's initial state are lost.
    await pollUntil(
        `'${entry}' to be focused`,
        async () => {
            const labels = await pickerRowLabels(picker);
            const current = (await focused.allInnerTexts()).at(0)?.replaceAll(/\s+/gu, " ").trim();
            if (current !== entry && labels.includes(entry)) {
                await filter.press("Home");
                for (let i = 0; i < labels.indexOf(entry); i++) {
                    await filter.press("ArrowDown");
                }
            }
            return current;
        },
        current => current === entry,
    );
    await filter.press("Enter");

    const input = picker.locator("input[placeholder=\"Branch name\"]");
    await input.waitFor({ state: "visible" });
    await input.fill(name);
    await input.press("Enter");
    return picker;
}

scenario("creating a branch checks it out at HEAD and keeps local changes", async () => {
    const main = await resolveRef("main");

    await createFromPicker("main*", "topic", "Create new branch...");

    await pollUntil("HEAD to be on topic", symbolicHead, ref => ref === "refs/heads/topic");
    assert.strictEqual(await resolveRef("topic"), main);
    assert.strictEqual(await localConfig("branch.topic.remote"), undefined);
    assert.deepStrictEqual(await status(), { "shared.txt": " M" });
    assert.strictEqual(await readFile(join(workspaceDir(), "shared.txt"), "utf8"), "local\n");
});

scenario("creating a branch from a remote branch starts it there without tracking it", async () => {
    const picker = await createNamed("topic*", "Create new branch from...", "from-feature");
    await picker.locator(`input[placeholder="Select a ref to create the 'from-feature' branch from"]`)
        .waitFor({ state: "visible" });
    await pickerRow(picker, "origin/feature").click();

    await pollUntil("HEAD to be on from-feature", symbolicHead, ref => ref === "refs/heads/from-feature");
    assert.strictEqual(await resolveRef("from-feature"), await resolveRef("origin/feature"));
    assert.strictEqual(await localConfig("branch.from-feature.remote"), undefined);
    assert.strictEqual(await localConfig("branch.from-feature.merge"), undefined);
    await pollUntil(
        "local changes to be carried over",
        status,
        current => isDeepStrictEqual(current, { "shared.txt": " M" }),
    );
});

scenario("creating a branch whose name is taken reports it and changes nothing", async () => {
    const existing = await resolveRef("existing");

    await createNamed("from-feature*", "Create new branch...", "existing");

    const failure = dialog(page, /fatal: a branch named 'existing' already exists/u);
    await failure.getByRole("button", { name: "Cancel" }).click();
    await failure.waitFor({ state: "hidden" });
    assert.strictEqual(await symbolicHead(), "refs/heads/from-feature");
    assert.strictEqual(await resolveRef("existing"), existing);
    assert.deepStrictEqual(await status(), { "shared.txt": " M" });
});
