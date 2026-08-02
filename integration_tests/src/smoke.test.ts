import assert from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { chromium, type Page } from "playwright-core";

/** Generous: a cold extension host boot dominates this test. */
const LOAD_TIMEOUT_MS = 120_000;

/**
 * `rules_itest` exports assigned ports keyed by canonical label. Matching on a suffix
 * keeps the test working regardless of how the repository is named.
 */
function assignedPort(labelSuffix: string): number {
    const raw = process.env["ASSIGNED_PORTS"];
    assert.ok(raw, "ASSIGNED_PORTS is unset; this test must run via the service_test target");

    const ports = JSON.parse(raw) as Record<string, number>;
    const key = Object.keys(ports).find(candidate => candidate.endsWith(labelSuffix));
    assert.ok(key, `no service matching '${labelSuffix}' in ${Object.keys(ports).join(", ")}`);

    return ports[key]!;
}

function workspaceDir(): string {
    const subdir = process.env["ITEST_WORKSPACE_SUBDIR"];
    assert.ok(subdir, "ITEST_WORKSPACE_SUBDIR is unset");
    return join(process.env["TEST_TMPDIR"] ?? "/tmp", subdir);
}

/** Screenshots land next to the test log, which Bazel zips into outputs.zip. */
async function capture(page: Page, name: string): Promise<void> {
    const dir = process.env["TEST_UNDECLARED_OUTPUTS_DIR"];
    if (dir === undefined) {
        return;
    }
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${name}.png`), await page.screenshot({ fullPage: true }));
}

test("the extension activates and reports working tree changes", { timeout: LOAD_TIMEOUT_MS * 2 }, async () => {
    const token = process.env["BROWSERLESS_TOKEN"];
    assert.ok(token, "BROWSERLESS_TOKEN is unset");

    // CDP rather than Playwright's own protocol: it does not require the client version
    // to match the browser build shipped inside the browserless image.
    const browser = await chromium.connectOverCDP(
        `ws://127.0.0.1:${assignedPort(":browserless_chromium_service")}?token=${token}`,
    );

    try {
        const context = browser.contexts()[0] ?? await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(LOAD_TIMEOUT_MS);

        const editorUrl = new URL(`http://127.0.0.1:${assignedPort(":code_server_service")}/`);
        editorUrl.searchParams.set("folder", workspaceDir());
        await page.goto(editorUrl.toString(), { waitUntil: "domcontentloaded" });

        try {
            await page.locator(".monaco-workbench").waitFor({ state: "visible" });

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
        }
    } finally {
        await browser.close();
    }
});
