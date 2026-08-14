import assert from "node:assert";
import { after, before } from "node:test";
import type { Locator, Page } from "playwright-core";
import { shortCommit } from "./git.js";
import {
    closePicker,
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    openPickerFromStatusBar,
    openScmView,
    openWorkbench,
    pickerRow,
    pollUntil,
    statusBarText,
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

async function description(row: Locator): Promise<string> {
    return (await row.locator(".label-description").innerText()).replaceAll(/\s+/gu, " ").trim();
}

scenario("the status bar reports the branch and its distance from the upstream", async () => {
    await openScmView(page);

    // Reaching this state means `git for-each-ref` resolved HEAD's upstream and the counts
    // git tracks against it.
    const rendered = await pollUntil(
        "the status bar to describe the branch",
        () => statusBarText(page),
        text => text.includes("main") && text.includes("0↓ 1↑"),
    );

    assert.match(rendered, /main/u);
});

scenario("the ref picker lists local branches, remote branches and tags", async () => {
    // Driven from the status bar because the builtin git extension contributes a command
    // with the same palette label as this one.
    const picker = await openPickerFromStatusBar(page, "main", "Select a ref to checkout");

    try {
        for (const branch of ["main", "feature"]) {
            await pickerRow(picker, branch).waitFor({ state: "visible" });
        }

        assert.strictEqual(await description(pickerRow(picker, "feature")), await shortCommit("feature"));
        assert.strictEqual(
            await description(pickerRow(picker, "origin/main")),
            `Remote branch at ${await shortCommit("origin/main")}`,
        );

        // The tag is annotated, so the commit it is rendered against is the one the tag
        // object points at rather than the tag object itself.
        assert.strictEqual(
            await description(pickerRow(picker, "v1.0.0")),
            `Tag at ${await shortCommit("v1.0.0^{commit}")}`,
        );
    } finally {
        await closePicker(page);
    }
});
