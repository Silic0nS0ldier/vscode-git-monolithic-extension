import assert from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { type Browser, chromium, type Locator, type Page } from "playwright-core";

/** Generous: a cold extension host boot dominates the first scenario. */
export const LOAD_TIMEOUT_MS = 120_000;

/** Once the workbench is up, no single interaction should take anywhere near this long. */
const ACTION_TIMEOUT_MS = 30_000;

/** The browser defaults to 800x600, which squashes the SCM view and the screenshots. */
const WINDOW_SIZE = { height: 1_080, width: 1_920 };

const OUTPUT_PANEL = "[id=\"workbench.panel.output\"]";

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

    const endpoint = new URL(`ws://127.0.0.1:${assignedPort(":browserless_chromium_service")}`);
    endpoint.searchParams.set("token", token);
    endpoint.searchParams.set(
        "launch",
        JSON.stringify({
            args: [`--window-size=${WINDOW_SIZE.width},${WINDOW_SIZE.height}`],
            defaultViewport: WINDOW_SIZE,
        }),
    );

    // CDP rather than Playwright's own protocol: it does not require the client version
    // to match the browser build shipped inside the browserless image.
    return await chromium.connectOverCDP(endpoint.toString());
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

/** Runs a command by the label the command palette lists it under. */
export async function runCommand(page: Page, label: string): Promise<void> {
    const palette = page.locator(".quick-input-widget");

    await page.keyboard.press("Control+Shift+P");
    await palette.waitFor({ state: "visible" });
    await page.keyboard.type(label);

    // A command contributed by an inactive extension is simply absent, and pressing enter
    // would then run whatever the fuzzy match turned up instead.
    await palette.locator(".monaco-list-row").filter({ hasText: label }).first().waitFor({ state: "visible" });
    await page.keyboard.press("Enter");
    await palette.waitFor({ state: "hidden" });
}

/**
 * Lines of the output channel shown in the panel that mention `text`. The editor only
 * renders the tail, so filtering is the way to reach lines written during activation.
 */
export async function filteredOutputPanelText(page: Page, text: string): Promise<string> {
    const panel = page.locator(OUTPUT_PANEL);

    await panel.waitFor({ state: "visible" });
    await page.locator(".viewpane-filter input").first().fill(text);

    // Filtering is debounced, so the panel keeps rendering the unfiltered tail for a beat.
    return await pollUntil(
        `the output panel to render a line matching '${text}'`,
        // The editor word-wraps and renders spaces as non-breaking, so the rendered text
        // only resembles the logged line once whitespace is collapsed.
        async () => (await panel.locator(".view-lines").innerText()).replaceAll(/\s+/gu, " "),
        rendered => rendered.includes(text),
    );
}

export async function closeOutputPanel(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Hide Panel" }).click();
    await page.locator(OUTPUT_PANEL).waitFor({ state: "hidden" });
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

/** The count badge on the header row of an SCM resource group, e.g. `Staged`. */
export function groupCount(view: Locator, group: string): Locator {
    // The header keeps the group name when populated and reads `Staged (empty)` otherwise.
    const name = new RegExp(`^${group}\\b`, "u");
    return view.locator(".monaco-list-row")
        .filter({ has: view.page().locator(".resource-group .name").filter({ hasText: name }) })
        .locator(".monaco-count-badge");
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

    // Reads are cheap and usually settle on the first retry, so start tight and back off.
    for (let interval = 25; !predicate(last); interval = Math.min(interval * 2, 250)) {
        assert.ok(Date.now() < deadline, `timed out waiting for ${describe}; last value: ${JSON.stringify(last)}`);
        await delay(interval);
        last = await read();
    }

    return last;
}
