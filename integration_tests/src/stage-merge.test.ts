import assert from "node:assert";
import { after, before } from "node:test";
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
