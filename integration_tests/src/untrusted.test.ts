import assert from "node:assert";
import { after, before } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Page } from "playwright-core";
import {
    closeOutputPanel,
    connect,
    createScenario,
    filteredOutputPanelText,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    runCommand,
    statusBarText,
} from "./harness.js";

/** Prefix of the line the model writes for every repository it opens. */
const OPENED = "Open repository";

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

scenario("the extension runs against a workspace opened in Restricted Mode", async () => {
    // Everything below only covers the untrusted discovery path if the workspace really is
    // untrusted, so this is a precondition rather than a feature of the extension.
    await pollUntil(
        "the workbench to report Restricted Mode",
        () => statusBarText(page),
        text => text.includes("Restricted Mode"),
    );

    // The control repository has no HEAD in its root, so the bare repository probe leaves
    // it alone and its change is reported as usual.
    const view = await openScmView(page);
    await resourceRow(view, "plain-repo.txt").waitFor({ state: "visible" });
});

scenario("nested repositories are opened unless the bare repository probe skips them", async () => {
    await runCommand(page, "Git: Show Git Output");

    // The control, which the scan reaches after the two folders it skips.
    await pollUntil(
        "the nested control repository to be opened",
        () => filteredOutputPanelText(page, OPENED),
        text => text.includes("plain-repo"),
    );

    // Skipping is silent, so there is no line to wait for; give the scan a beat to write
    // one that would contradict the assertions below.
    await delay(2_000);
    const opened = await filteredOutputPanelText(page, OPENED);

    // `rev-parse --show-cdup` reports an empty path for both, so neither is opened. The
    // work tree is a false positive the probe cannot tell apart from the bare repository.
    assert.doesNotMatch(opened, /head-file-repo/u);
    assert.doesNotMatch(opened, /bare\.git/u);

    await closeOutputPanel(page);
});
