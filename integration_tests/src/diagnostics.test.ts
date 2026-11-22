import * as assert from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Page } from "playwright-core";
import {
    connect,
    createScenario,
    diffEditorSides,
    LOAD_TIMEOUT_MS,
    openPicker,
    openScmView,
    openWorkbench,
    pickerRow,
    pollUntil,
    resourceRow,
    runCommand,
    testTmpDir,
    workspaceDir,
} from "./harness.js";

interface DiagnosticReport {
    readonly activity: {
        readonly recent: readonly {
            readonly kind: "git" | "operation";
            readonly label: string;
        }[];
    };
    readonly cpuProfile: {
        readonly file?: string;
        readonly state: "not-started" | "recording" | "saved";
    };
    readonly environment: {
        readonly extensionVersion: string;
        readonly gitVersion: string;
        readonly platform: string;
        readonly vscodeVersion: string;
    };
    readonly eventLoop: {
        readonly intervalMs: number;
        readonly sampleCount: number;
    };
    readonly formatVersion: number;
    readonly modelState: string;
    readonly repositories: readonly {
        readonly alias: string;
        readonly state: {
            readonly merge: number;
            readonly staged: number;
            readonly tracked: number;
            readonly untracked: number;
        };
    }[];
}

interface CpuProfile {
    readonly endTime: number;
    readonly nodes: readonly unknown[];
    readonly startTime: number;
}

const DIAGNOSTICS_DIRECTORY = join(
    testTmpDir(),
    "code-server",
    "user",
    "User",
    "globalStorage",
    "siliconsoldier.git-monolithic",
    "performance-diagnostics",
);

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

async function filesEndingWith(suffix: string): Promise<string[]> {
    try {
        return (await readdir(DIAGNOSTICS_DIRECTORY))
            .filter(name => name.endsWith(suffix))
            .toSorted();
    } catch (failure) {
        if (
            typeof failure === "object" && failure !== null
            && "code" in failure && failure.code === "ENOENT"
        ) {
            return [];
        }
        throw failure;
    }
}

async function readReport(name: string): Promise<DiagnosticReport> {
    return JSON.parse(await readFile(join(DIAGNOSTICS_DIRECTORY, name), "utf8")) as DiagnosticReport;
}

scenario("performance diagnostics capture state and omit repository paths and Git output", async () => {
    const view = await openScmView(page);
    await resourceRow(view, "tracked.txt").click();
    await pollUntil(
        "the tracked change diff to render",
        () => diffEditorSides(page),
        sides => sides.original.includes("tracked") && sides.modified.includes("modified"),
    );

    const picker = await openPicker(
        page,
        "Git: Collect Performance Diagnostics",
        "Collect performance diagnostics",
    );
    assert.deepStrictEqual(
        await picker.locator(".monaco-list-row .label-name").allInnerTexts(),
        ["Save current snapshot", "Start CPU profile"],
    );
    await pickerRow(picker, "Save current snapshot").click();
    await picker.waitFor({ state: "hidden" });

    const reportName = await pollUntil(
        "the performance report to be saved",
        async () => (await filesEndingWith(".json")).at(-1),
        value => value !== undefined,
    );
    assert.ok(reportName);
    const report = await readReport(reportName);

    assert.strictEqual(report.formatVersion, 1);
    assert.strictEqual(report.modelState, "initialized");
    assert.strictEqual(report.environment.platform, process.platform);
    assert.notStrictEqual(report.environment.extensionVersion, "unknown");
    assert.match(report.environment.gitVersion, /^\d+\.\d+/u);
    assert.match(report.environment.vscodeVersion, /^\d+\.\d+/u);
    assert.ok(report.eventLoop.intervalMs > 0);
    assert.ok(report.eventLoop.sampleCount >= 0);
    assert.deepStrictEqual(report.repositories.map(repository => repository.alias), ["repository-1"]);
    assert.deepStrictEqual(report.repositories.map(repository => repository.state), [
        { merge: 0, staged: 0, tracked: 1, untracked: 1 },
    ]);
    assert.ok(
        report.activity.recent.some(activity => activity.kind === "operation" && activity.label === "Refresh"),
        "the report did not contain a repository refresh",
    );
    assert.ok(
        report.activity.recent.some(activity => activity.kind === "operation" && activity.label === "Show"),
        "the report did not contain the content read used to render a file diff",
    );
    assert.ok(
        report.activity.recent.some(activity => activity.kind === "git" && /:status$/u.test(activity.label)),
        "the report did not contain a Git status invocation",
    );

    const serialized = JSON.stringify(report);
    assert.ok(!serialized.includes(workspaceDir()), "the report included the workspace path");
    assert.ok(!serialized.includes("tracked.txt"), "the report included a repository file name");
});

scenario("a CPU profile can be started and stopped from the public command", async () => {
    const picker = await openPicker(
        page,
        "Git: Collect Performance Diagnostics",
        "Collect performance diagnostics",
    );
    await pickerRow(picker, "Start CPU profile").click();
    await picker.waitFor({ state: "hidden" });

    const recording = await pollUntil(
        "the profile start report to be saved",
        async () => {
            for (const name of (await filesEndingWith(".json")).toReversed()) {
                const report = await readReport(name);
                if (report.cpuProfile.state === "recording") return report;
            }
            return undefined;
        },
        value => value !== undefined,
    );
    assert.ok(recording);

    await delay(250);
    await runCommand(page, "Git: Collect Performance Diagnostics");

    const saved = await pollUntil(
        "the CPU profile to finish saving",
        async () => {
            for (const name of (await filesEndingWith(".json")).toReversed()) {
                const report = await readReport(name);
                if (report.cpuProfile.state === "saved") return report;
            }
            return undefined;
        },
        value => value !== undefined,
    );
    assert.ok(saved);
    assert.ok(saved.cpuProfile.file);
    assert.ok((await filesEndingWith(".cpuprofile")).includes(saved.cpuProfile.file));

    const profile = JSON.parse(
        await readFile(join(DIAGNOSTICS_DIRECTORY, saved.cpuProfile.file), "utf8"),
    ) as CpuProfile;
    assert.ok(profile.nodes.length > 0);
    assert.ok(profile.endTime > profile.startTime);
});
