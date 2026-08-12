import assert from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type Browser, chromium, type Locator, type Page } from "playwright-core";

/** Generous: a cold extension host boot dominates the first scenario. */
export const LOAD_TIMEOUT_MS = 120_000;

/** Once the workbench is up, no single interaction should take anywhere near this long. */
const ACTION_TIMEOUT_MS = 30_000;

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

/** Shared with the fixture task, which runs in the same test action. */
export function testTmpDir(): string {
    return process.env["TEST_TMPDIR"] ?? "/tmp";
}

export function workspaceDir(): string {
    const subdir = process.env["ITEST_WORKSPACE_SUBDIR"];
    assert.ok(subdir, "ITEST_WORKSPACE_SUBDIR is unset");
    return join(testTmpDir(), subdir);
}

/** Screenshots land next to the test log, which Bazel zips into outputs.zip. */
export async function capture(page: Page, name: string): Promise<void> {
    const dir = process.env["TEST_UNDECLARED_OUTPUTS_DIR"];
    if (dir === undefined) {
        return;
    }
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${name}.png`), await page.screenshot({ fullPage: true }));
}

export async function connect(): Promise<Browser> {
    const token = process.env["BROWSERLESS_TOKEN"];
    assert.ok(token, "BROWSERLESS_TOKEN is unset");

    // CDP rather than Playwright's own protocol: it does not require the client version
    // to match the browser build shipped inside the browserless image.
    return await chromium.connectOverCDP(
        `ws://127.0.0.1:${assignedPort(":browserless_chromium_service")}?token=${token}`,
    );
}

export async function openWorkbench(browser: Browser): Promise<Page> {
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(LOAD_TIMEOUT_MS);

    const editorUrl = new URL(`http://127.0.0.1:${assignedPort(":code_server_service")}/`);
    editorUrl.searchParams.set("folder", workspaceDir());
    await page.goto(editorUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.locator(".monaco-workbench").waitFor({ state: "visible" });
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);

    return page;
}

/** The history view is a second `.scm-view`, and it renders commits rather than changes. */
export function scmView(page: Page): Locator {
    return page.locator(".scm-view:not(.scm-history-view)").first();
}

export async function openScmView(page: Page): Promise<Locator> {
    await page.keyboard.press("Control+Shift+G");
    const view = scmView(page);
    await view.waitFor({ state: "visible" });
    return view;
}

/** The row of the SCM list whose resource label is exactly `fileName`. */
export function resourceRow(view: Locator, fileName: string): Locator {
    const exact = new RegExp(`^${fileName.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}$`, "u");
    return view.locator(".monaco-list-row").filter({
        has: view.page().locator(".label-name").filter({ hasText: exact }),
    });
}

export async function invokeRowAction(view: Locator, fileName: string, action: string): Promise<void> {
    const row = resourceRow(view, fileName);
    const button = row.getByRole("button", { name: action });

    // Row actions only render while the row is hovered, and acting on one resource
    // re-renders the list out from under the pointer, so re-establish the hover on failure.
    for (let remaining = 3;; remaining--) {
        await row.hover();
        try {
            await button.click({ timeout: 5_000 });
            return;
        } catch (error) {
            if (remaining === 0) {
                throw error;
            }
        }
    }
}

/**
 * The extension writes to git asynchronously, so every git-side assertion has to wait for
 * the UI action to land rather than read once.
 */
export async function pollUntil<T>(
    describe: string,
    read: () => Promise<T>,
    predicate: (value: T) => boolean,
    timeoutMs = 30_000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let last: T = await read();

    while (!predicate(last)) {
        assert.ok(Date.now() < deadline, `timed out waiting for ${describe}; last value: ${JSON.stringify(last)}`);
        await delay(250);
        last = await read();
    }

    return last;
}
