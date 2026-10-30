import assert from "node:assert";
import { appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import type { Locator, Page } from "playwright-core";
import {
    headIdentities,
    headSubject,
    localConfig,
    setLocalConfig,
    stage,
    status,
    unsetLocalConfig,
    userConfig,
} from "./git.js";
import {
    connect,
    createScenario,
    dialog,
    groupCount,
    LOAD_TIMEOUT_MS,
    openScmView,
    openWorkbench,
    pollUntil,
    scmInputText,
    scmView,
    workspaceDir,
} from "./harness.js";

const FIRST_MESSAGE = "Commit needing an identity";
const SECOND_MESSAGE = "Commit saving the identity to the repository";
const THIRD_MESSAGE = "Commit saving the identity to the user";

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

async function submitCommit(): Promise<void> {
    const view = scmView(page);
    // The input box is a Monaco editor; its textarea is not directly clickable.
    await view.locator(".monaco-editor").first().click();
    await page.keyboard.press("Control+Enter");
}

function nameInput(): Locator {
    return page.locator(".quick-input-widget input[placeholder=\"Your Name\"]");
}

function emailInput(): Locator {
    return page.locator(".quick-input-widget input[placeholder=\"you@example.com\"]");
}

/** Answers the name and email prompts, keeping what they open with where undefined; returns what that was. */
async function answerPrompts(answers: { name?: string; email?: string }): Promise<{ name: string; email: string }> {
    const prefilled = { email: "", name: "" };

    for (const [input, key] of [[nameInput(), "name"], [emailInput(), "email"]] as const) {
        await input.waitFor({ state: "visible" });
        prefilled[key] = await input.inputValue();
        const answer = answers[key];
        if (answer !== undefined) {
            await input.fill(answer);
        }
        await input.press("Enter");
    }

    return prefilled;
}

async function confirm(name: string, email: string, button: string): Promise<void> {
    const prompt = dialog(page, new RegExp(`Commit as ${RegExp.escape(name)} <${RegExp.escape(email)}>\\?`, "u"));
    await prompt.getByRole("button", { name: button }).click();
    await prompt.waitFor({ state: "hidden" });
}

/** Stages a fresh change and types `message` into the input box, ready to commit. */
async function prepareCommit(message: string): Promise<void> {
    const view = scmView(page);

    await appendFile(join(workspaceDir(), "tracked.txt"), `${message}\n`);
    await stage("tracked.txt");
    // Committing before the view catches up prompts to stage everything instead.
    await groupCount(view, "Staged").filter({ hasText: /^1$/u }).waitFor({ state: "visible" });

    await view.locator(".monaco-editor").first().click();
    await page.keyboard.type(message);
}

async function dismiss(prompt: ReturnType<typeof dialog>): Promise<void> {
    await page.keyboard.press("Escape");
    await prompt.waitFor({ state: "hidden" });
}

scenario("a commit rejected by a hook reports the hook's message, not missing user details", async () => {
    const view = await openScmView(page);

    await view.locator(".monaco-editor").first().click();
    await page.keyboard.type(FIRST_MESSAGE);
    await page.keyboard.press("Control+Enter");

    const error = dialog(page, /Commit rejected by the test hook/u);
    await error.waitFor({ state: "visible" });
    assert.strictEqual(await dialog(page, /user\.name/u).count(), 0, "the hook failure blamed user details");
    await dismiss(error);

    assert.strictEqual(await headSubject(), "Initial commit");
    assert.deepStrictEqual(await status(), { "tracked.txt": "M " });
});

scenario("committing without user details asks who to commit as, and backing out commits nothing", async () => {
    await rm(join(workspaceDir(), ".git", "reject-commit"));
    await unsetLocalConfig("user.name");
    await unsetLocalConfig("user.email");

    const view = scmView(page);
    assert.strictEqual(await scmInputText(view), FIRST_MESSAGE, "the failed commit lost its message");
    await submitCommit();

    await nameInput().waitFor({ state: "visible" });
    await page.keyboard.press("Escape");
    await nameInput().waitFor({ state: "hidden" });

    await assert.rejects(
        dialog(page, /./u).waitFor({ state: "visible", timeout: 2_000 }),
        "backing out surfaced an error",
    );
    assert.strictEqual(await headSubject(), "Initial commit");
    assert.strictEqual(await scmInputText(view), FIRST_MESSAGE, "backing out lost the message");
    assert.strictEqual(await localConfig("user.name"), undefined);
    assert.strictEqual(await localConfig("user.email"), undefined);
});

scenario("committing once commits as the details given, prefilled with those known, and saves nothing", async () => {
    await setLocalConfig("user.email", "known@example.invalid");
    await submitCommit();

    const prefilled = await answerPrompts({ name: "Once Author" });
    assert.deepStrictEqual(
        prefilled,
        { email: "known@example.invalid", name: "" },
        "the known details were not prefilled",
    );
    await confirm("Once Author", "known@example.invalid", "Commit Once");

    await pollUntil("the commit to be created", headSubject, subject => subject === FIRST_MESSAGE);
    assert.deepStrictEqual(await headIdentities(), {
        author: "Once Author <known@example.invalid>",
        committer: "Once Author <known@example.invalid>",
    });
    assert.strictEqual(await localConfig("user.name"), undefined);
    assert.strictEqual(await userConfig("user.name"), undefined);

    await unsetLocalConfig("user.email");
});

scenario("saving to the repository writes its config, then commits", async () => {
    await prepareCommit(SECOND_MESSAGE);
    await submitCommit();

    await answerPrompts({ email: "repo@example.invalid", name: "Repo Author" });
    await confirm("Repo Author", "repo@example.invalid", "Save to Repository and Commit");

    await pollUntil("the commit to be created", headSubject, subject => subject === SECOND_MESSAGE);
    assert.strictEqual(await headIdentities().then(ids => ids.author), "Repo Author <repo@example.invalid>");
    assert.strictEqual(await localConfig("user.name"), "Repo Author");
    assert.strictEqual(await localConfig("user.email"), "repo@example.invalid");
    assert.strictEqual(await userConfig("user.name"), undefined);

    await unsetLocalConfig("user.name");
    await unsetLocalConfig("user.email");
});

scenario("saving to the user writes the user's config, then commits", async () => {
    await prepareCommit(THIRD_MESSAGE);
    await submitCommit();

    await answerPrompts({ email: "user@example.invalid", name: "User Author" });
    await confirm("User Author", "user@example.invalid", "Save to User and Commit");

    await pollUntil("the commit to be created", headSubject, subject => subject === THIRD_MESSAGE);
    assert.strictEqual(await headIdentities().then(ids => ids.author), "User Author <user@example.invalid>");
    assert.strictEqual(await userConfig("user.name"), "User Author");
    assert.strictEqual(await userConfig("user.email"), "user@example.invalid");
    assert.strictEqual(await localConfig("user.name"), undefined);
});
