import assert from "node:assert";
import { after, before } from "node:test";
import { isDeepStrictEqual } from "node:util";
import type { Page } from "playwright-core";
import { status } from "./git.js";
import {
    connect,
    createScenario,
    dialog,
    invokeGroupAction,
    invokeRowAction,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
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

const CONFLICTED = {
    "deleted-by-us.txt": "DU",
    "resolved.txt": "UU",
    "unresolved.txt": "UU",
};

scenario("cancelling the deletion prompt for a conflict stages nothing and raises no error", async () => {
    const view = await openScmView(page);

    await invokeRowAction(view, "deleted-by-us.txt", "Stage Changes");

    const prompt = dialog(page, /was deleted by us and modified by them/u);
    await prompt.getByRole("button", { name: "Cancel" }).click();
    await prompt.waitFor({ state: "hidden" });

    // The error would surface as a follow-up modal, so give it the chance to.
    await assert.rejects(
        dialog(page, /unexpected error/u).waitFor({ state: "visible", timeout: 2_000 }),
        "cancelling surfaced an error",
    );
    assert.deepStrictEqual(await status(), CONFLICTED);
});

scenario("Stage All Merge Changes asks about only the unresolved file, before resolving anything", async () => {
    const view = await openScmView(page);

    await invokeGroupAction(view, "Merge", "Stage All Merge Changes");

    const warning = dialog(page, /Are you sure you want to stage unresolved\.txt with merge conflicts\?/u);
    await warning.getByRole("button", { name: "Cancel" }).click();
    await warning.waitFor({ state: "hidden" });

    assert.deepStrictEqual(await status(), CONFLICTED);
});

scenario("confirming Stage All Merge Changes stages every conflict, deletions included", async () => {
    const view = await openScmView(page);

    await invokeGroupAction(view, "Merge", "Stage All Merge Changes");

    const warning = dialog(page, /Are you sure you want to stage unresolved\.txt with merge conflicts\?/u);
    await warning.getByRole("button", { name: "Yes" }).click();

    const prompt = dialog(page, /was deleted by us and modified by them/u);
    await prompt.getByRole("button", { name: "Delete File" }).click();

    await pollUntil(
        "every conflict to be staged",
        status,
        current => isDeepStrictEqual(current, { "resolved.txt": "M ", "unresolved.txt": "M " }),
    );
});
