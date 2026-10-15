import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { type ChildOutput, type Metrics, type Mode, MODES, type SubjectName, SUBJECTS } from "./protocol.js";

/**
 * `--predictable` removes V8 background threads (concurrent compilation, GC) and fixes the GC schedule,
 * which otherwise make retained heap vary between runs.
 */
const NODE_FLAGS = ["--predictable", "--expose-gc"];
/**
 * Under Bazel `process.execPath` is rules_js's wrapper, which patches `node:fs` in child processes. Those
 * patches would be counted as fs calls and coverage, so children use the plain binary.
 */
const NODE_BINARY = process.env["JS_BINARY__NODE_BINARY"] ?? process.execPath;

/**
 * Compared between subjects in every phase. `coverage.blocks` is left out: V8 omits blocks that ran as often
 * as their enclosing range, so the count depends on code shape as much as on work done.
 */
const COMPARED_PER_PHASE = ["fs.total", "coverage.functions"] as const;
const COMPARED_CRAWL = ["inotify.watches", "heap.retained"] as const;

/** Allowed deviation is the larger of the two. `null` records the metric without checking it. */
type Tolerance = { readonly relative: number; readonly absolute: number } | null;

type Expected = {
    /** Per subject, per metric family (the metric name up to the first `.`). */
    readonly tolerance: Record<SubjectName, Record<string, Tolerance>>;
    readonly results: Record<SubjectName, Metrics>;
};

const EXACT: Tolerance = { relative: 0, absolute: 0 };
const DEFAULT_TOLERANCE: Expected["tolerance"] = {
    sauron: {
        coverage: { relative: 0.001, absolute: 5 },
        fs: EXACT,
        heap: { relative: 0.005, absolute: 0 },
        inotify: EXACT,
    },
    watcher: {
        // Varies by up to ~15% between runs, as `watcher` batches by timing. Still used for comparison.
        coverage: null,
        fs: EXACT,
        heap: { relative: 0.005, absolute: 0 },
        inotify: EXACT,
    },
};
const EXPECTED_PATH = path.join(import.meta.dirname, "../../src/bench/expected.json");
const UPDATE_HINT = "If the change is intended, run `bazel run //packages/sauron:bench_update` and commit the result.";

async function runChild(subject: SubjectName, mode: Mode): Promise<ChildOutput> {
    const outputDir = fs.mkdtempSync(path.join(process.env["TEST_TMPDIR"] ?? os.tmpdir(), "sauron-bench-"));
    const outputFile = path.join(outputDir, "output.json");
    const env: NodeJS.ProcessEnv = { ...process.env, JS_BINARY__PATCH_NODE_FS: "0" };
    delete env["NODE_OPTIONS"];
    const child = spawn(
        NODE_BINARY,
        [...NODE_FLAGS, path.join(import.meta.dirname, "child.js"), subject, mode, outputFile],
        { env, stdio: ["ignore", "inherit", "inherit"] },
    );
    const code = await new Promise<number | null>(resolve => child.once("exit", resolve));
    if (code !== 0) {
        throw new Error(`Benchmark child (${subject}, ${mode}) exited with ${code}`);
    }
    const output = JSON.parse(fs.readFileSync(outputFile, "utf8")) as ChildOutput;
    fs.rmSync(outputDir, { recursive: true, force: true });
    return output;
}

type Results = {
    readonly metrics: Record<SubjectName, Metrics>;
    readonly info: Record<SubjectName, Record<string, number>>;
    readonly problems: string[];
};

async function runAll(): Promise<Results> {
    const metrics = {} as Record<SubjectName, Metrics>;
    const info = {} as Record<SubjectName, Record<string, number>>;
    const problems: string[] = [];
    // Sequential, so subjects do not compete for the CPU or the kernel's inotify queue.
    for (const subject of SUBJECTS) {
        const outputs = {} as Record<Mode, ChildOutput>;
        for (const mode of MODES) {
            outputs[mode] = await runChild(subject, mode);
            problems.push(...outputs[mode].problems.map(p => `${subject} (${mode}): ${p}`));
        }
        const merged = outputs.counts.metrics;
        merged["crawl"] = { ...merged["crawl"], "heap.retained": outputs.heap.metrics["crawl"]!["heap.retained"]! };
        metrics[subject] = merged;
        info[subject] = { "crawl.ms (counts)": outputs.counts.info["crawl.ms"]!, ...prefixed(outputs.heap.info) };
    }
    return { metrics, info, problems };
}

function prefixed(info: Record<string, number>): Record<string, number> {
    return Object.fromEntries(Object.entries(info).map(([key, value]) => [`${key} (heap)`, value]));
}

type Comparison = [name: string, sauron: number, watcher: number];

function comparisons(metrics: Record<SubjectName, Metrics>): Comparison[] {
    const compare = (phase: string, metric: string): Comparison => [
        `${phase} ${metric}`,
        metrics.sauron[phase]?.[metric] ?? NaN,
        metrics.watcher[phase]?.[metric] ?? NaN,
    ];
    const phases = Object.keys(metrics.sauron);
    return [
        ...phases.flatMap(phase => COMPARED_PER_PHASE.map(metric => compare(phase, metric))),
        ...COMPARED_CRAWL.map(metric => compare("crawl", metric)),
    ];
}

function report(results: Results): void {
    const rows: string[][] = [["phase", "metric", ...SUBJECTS]];
    const phases = new Set(SUBJECTS.flatMap(s => Object.keys(results.metrics[s])));
    for (const phase of phases) {
        const metrics = new Set(SUBJECTS.flatMap(s => Object.keys(results.metrics[s][phase] ?? {})));
        for (const metric of [...metrics].sort()) {
            rows.push([phase, metric, ...SUBJECTS.map(s => String(results.metrics[s][phase]?.[metric] ?? "-"))]);
        }
    }
    for (const key of Object.keys(results.info.sauron)) {
        rows.push(["(info)", key, ...SUBJECTS.map(s => String(results.info[s][key] ?? "-"))]);
    }
    const widths = rows[0]!.map((_, i) => Math.max(...rows.map(row => row[i]!.length)));
    for (const row of rows) {
        console.log(row.map((cell, i) => i < 2 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!)).join("  "));
    }
}

function deviations(actual: Metrics, expected: Metrics, tolerance: Record<string, Tolerance>): string[] {
    const found: string[] = [];
    for (const phase of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
        const want = expected[phase] ?? {};
        const got = actual[phase] ?? {};
        for (const metric of new Set([...Object.keys(want), ...Object.keys(got)])) {
            const w = want[metric];
            const g = got[metric];
            if (w === undefined || g === undefined) {
                found.push(`${phase} ${metric}: expected ${w ?? "nothing"}, got ${g ?? "nothing"}`);
                continue;
            }
            const configured = tolerance[metric.slice(0, metric.indexOf("."))];
            const family = configured === undefined ? EXACT : configured;
            if (family === null) {
                continue;
            }
            const allowed = Math.max(family.absolute, Math.abs(w) * family.relative);
            if (Math.abs(g - w) > allowed) {
                const change = w === 0 ? "" : ` (${g > w ? "+" : ""}${((g - w) / w * 100).toFixed(2)}%)`;
                found.push(`${phase} ${metric}: expected ${w} ± ${Math.floor(allowed)}, got ${g}${change}`);
            }
        }
    }
    return found;
}

function readExpected(): Expected | null {
    try {
        return JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf8")) as Expected;
    } catch {
        return null;
    }
}

const results = await runAll();
report(results);

if (process.argv.includes("--update")) {
    const workspace = process.env["BUILD_WORKSPACE_DIRECTORY"];
    if (workspace === undefined) {
        throw new Error("--update must be run with `bazel run`");
    }
    if (results.problems.length > 0) {
        throw new Error(`Refusing to update, the run was invalid:\n${results.problems.join("\n")}`);
    }
    const tolerance = { ...DEFAULT_TOLERANCE, ...readExpected()?.tolerance };
    const updated: Expected = { tolerance, results: results.metrics };
    const target = path.join(workspace, "packages/sauron/src/bench/expected.json");
    fs.writeFileSync(target, JSON.stringify(updated, null, 4) + "\n");
    console.log(`Updated ${target}`);
} else {
    const expected = readExpected();

    test("every subject reports the changes made in each phase", () => {
        assert.deepStrictEqual(results.problems, []);
    });

    for (const subject of SUBJECTS) {
        test(`${subject} results are within the expected range`, () => {
            if (expected === null) {
                assert.fail(`${EXPECTED_PATH} is missing or invalid. ${UPDATE_HINT}`);
            }
            const found = deviations(
                results.metrics[subject],
                expected.results[subject] ?? {},
                expected.tolerance[subject] ?? {},
            );
            if (found.length > 0) {
                assert.fail(
                    `${found.length} metric(s) outside the expected range:\n${found.join("\n")}\n${UPDATE_HINT}`,
                );
            }
        });
    }

    test("sauron does no more work than watcher", () => {
        const worse = comparisons(results.metrics)
            .filter(([, sauron, watcher]) => !(sauron <= watcher))
            .map(([metric, sauron, watcher]) => `${metric}: sauron ${sauron} > watcher ${watcher}`);
        assert.deepStrictEqual(worse, []);
    });
}
