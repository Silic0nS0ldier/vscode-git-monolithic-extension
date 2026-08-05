import assert from "node:assert";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

/** Generous: a cold extension host boot dominates these tests. */
export const LOAD_TIMEOUT_MS = 120_000;

/**
 * `rules_itest` exports assigned ports keyed by canonical label. Matching on a suffix
 * keeps the tests working regardless of how the repository is named.
 */
export function assignedPort(labelSuffix: string): number {
    const raw = process.env["ASSIGNED_PORTS"];
    assert.ok(raw, "ASSIGNED_PORTS is unset; this test must run via the service_test target");

    const ports = JSON.parse(raw) as Record<string, number>;
    const key = Object.keys(ports).find(candidate => candidate.endsWith(labelSuffix));
    assert.ok(key, `no service matching '${labelSuffix}' in ${Object.keys(ports).join(", ")}`);

    return ports[key]!;
}

/** Directory the fixture task created, and which the editor opens. */
export function workspaceDir(): string {
    const subdir = process.env["ITEST_WORKSPACE_SUBDIR"];
    assert.ok(subdir, "ITEST_WORKSPACE_SUBDIR is unset");
    return join(process.env["TEST_TMPDIR"] ?? "/tmp", subdir);
}

/**
 * Companion directories created alongside the workspace by the fixture task. Kept
 * outside the workspace so cloning does not disturb the SCM view under test.
 */
export function fixtureDir(suffix: string): string {
    return `${workspaceDir()}-${suffix}`;
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

/** Connects to the browserless service and opens the editor on the fixture workspace. */
export async function openEditor(): Promise<{ page: Page; close: () => Promise<void> }> {
    const token = process.env["BROWSERLESS_TOKEN"];
    assert.ok(token, "BROWSERLESS_TOKEN is unset");

    // CDP rather than Playwright's own protocol: it does not require the client version
    // to match the browser build shipped inside the browserless image.
    const browser = await chromium.connectOverCDP(
        `ws://127.0.0.1:${assignedPort(":browserless_chromium_service")}?token=${token}`,
    );

    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(LOAD_TIMEOUT_MS);

    const editorUrl = new URL(`http://127.0.0.1:${assignedPort(":code_server_service")}/`);
    editorUrl.searchParams.set("folder", workspaceDir());
    await page.goto(editorUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.locator(".monaco-workbench").waitFor({ state: "visible" });

    return { close: () => browser.close(), page };
}

/** Runs a command by title through the command palette. */
export async function runCommand(page: Page, title: string): Promise<void> {
    await page.keyboard.press("Control+Shift+P");
    const input = page.locator(".quick-input-widget .quick-input-box input");
    await input.waitFor({ state: "visible" });
    await input.fill(`>${title}`);
    await page.locator(".quick-input-list .monaco-list-row").first().waitFor({ state: "visible" });
    await page.keyboard.press("Enter");
}
