import assert from "node:assert";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Page } from "playwright-core";
import { setLocalConfig } from "./git.js";
import {
    connect,
    createScenario,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    resourceRow,
    runCommand,
    scmInputText,
    scmView,
    workspaceDir,
} from "./harness.js";

/** `fixtures/commit-template.sh`'s template, as the input box renders it. */
const TEMPLATE = "Template subject Template body";

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

scenario("the commit template is pre-filled into the input box, comment stripped", async () => {
    // `restoreCommitTemplate` is hidden from the palette (`"when": "false"`): the template
    // reaches the input box on its own, via `commitTemplate` on every model refresh.
    const view = await openScmView(page);

    const text = await pollUntil("the template to be restored", () => scmInputText(view), value => value !== "");

    assert.strictEqual(text, TEMPLATE);
    assert.doesNotMatch(text, /must not reach/u);
});

scenario("pointing commit.template elsewhere replaces the pre-filled template", async () => {
    const view = scmView(page);
    await writeFile(join(workspaceDir(), ".gitmessage-other"), "Other subject\n");

    await setLocalConfig("commit.template", ".gitmessage-other");

    assert.strictEqual(
        await pollUntil("the other template to be restored", () => scmInputText(view), value => value !== TEMPLATE),
        "Other subject",
    );
});

scenario("an edit to the template file waits for a deliberate refresh", async () => {
    const view = scmView(page);
    await writeFile(join(workspaceDir(), ".gitmessage-other"), "Edited subject\n");

    // Nothing watches the template itself, so a refresh some other change causes keeps the cached one.
    await writeFile(join(workspaceDir(), "unrelated.txt"), "unrelated\n");
    await resourceRow(view, "unrelated.txt").waitFor({ state: "visible" });
    assert.strictEqual(await scmInputText(view), "Other subject");

    await runCommand(page, "Git: Refresh");

    assert.strictEqual(
        await pollUntil(
            "the edited template to be restored",
            () => scmInputText(view),
            value => value !== "Other subject",
        ),
        "Edited subject",
    );
});
