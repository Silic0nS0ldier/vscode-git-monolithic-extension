import fs from "node:fs";
import path from "node:path";
import { type Coverage, startCoverage } from "./coverage.js";
import { createFixture, type Fixture, PHASES } from "./fixture.js";
import { type FsProbe, installFsProbe } from "./fs-probe.js";
import { type ChildOutput, type Metrics, type Mode, MODES, type SubjectName, SUBJECTS } from "./protocol.js";
import type { StartSubject, Subject } from "./subjects/mod.js";

const SETTLE_MS = 50;
/** Quiet time (no fs calls, completions or notifications) after which a phase is considered finished. */
const IDLE_MS = 250;
const PHASE_TIMEOUT_MS = 60_000;

const HARNESS_SCRIPT = /\/dist\/bench\/[^/]+\.js$/;

function isMeasured(url: string): boolean {
    return url.startsWith("file:") && !HARNESS_SCRIPT.test(url);
}

function inotifyWatches(): number {
    let watches = 0;
    for (const fd of fs.readdirSync("/proc/self/fdinfo")) {
        try {
            const info = fs.readFileSync(`/proc/self/fdinfo/${fd}`, "utf8");
            watches += info.split("\n").filter(line => line.startsWith("inotify wd:")).length;
        } catch {
            // The descriptor closed while listing.
        }
    }
    return watches;
}

function retainedHeap(): number {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (gc === undefined) {
        throw new Error("Heap mode requires --expose-gc");
    }
    for (let i = 0; i < 4; i++) {
        gc();
    }
    return process.memoryUsage().heapUsed;
}

type Run = {
    readonly probe: FsProbe;
    readonly coverage: Coverage | null;
    readonly metrics: Metrics;
    readonly problems: string[];
    notifications: number;
};

async function quiesce(run: Run, requireNotificationAfter: number | null): Promise<void> {
    const deadline = performance.now() + PHASE_TIMEOUT_MS;
    for (;;) {
        await new Promise(resolve => setTimeout(resolve, 20));
        const now = performance.now();
        if (now > deadline) {
            throw new Error("Timed out waiting for the subject to become idle");
        }
        const notified = requireNotificationAfter === null || run.notifications > requireNotificationAfter;
        if (notified && run.probe.inflight === 0 && now - run.probe.lastActivity >= IDLE_MS) {
            return;
        }
    }
}

/** `before` runs uncounted (fixture mutations), `during` runs counted (the subject's own calls). */
async function measure(
    run: Run,
    name: string,
    subject: () => Subject | null,
    steps: { before?: () => void; during?: () => Promise<void> | void; notify: boolean },
): Promise<void> {
    steps.before?.();
    const notificationsBefore = run.notifications;
    run.probe.counting = true;
    run.probe.touch();
    await steps.during?.();
    await quiesce(run, steps.notify ? notificationsBefore : null);
    await subject()?.drain();
    run.probe.counting = false;

    const counts = run.probe.take();
    const phase: Record<string, number> = {};
    let total = 0;
    for (const [fn, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
        phase[`fs.${fn}`] = count;
        total += count;
    }
    phase["fs.total"] = total;
    if (run.coverage !== null) {
        const { functions, blocks } = await run.coverage.take();
        phase["coverage.functions"] = functions;
        phase["coverage.blocks"] = blocks;
    }
    run.metrics[name] = phase;
}

function checkReported(run: Run, fixture: Fixture, subject: Subject, phase: string, expect: string): void {
    const target = path.join(fixture.root, expect);
    const reported = subject.takeReported();
    const covered = reported.has(target) || reported.values().some(p => target.startsWith(p + "/"));
    if (!covered) {
        run.problems.push(`${phase}: "${expect}" was not reported`);
    }
}

async function main(subjectName: SubjectName, mode: Mode, outputFile: string): Promise<void> {
    // Fixed length, as retained heap includes path strings and sandbox paths vary between machines.
    const workdir = fs.mkdtempSync("/tmp/sauron-bench-");
    const fixture = createFixture(path.join(workdir, "repo"));

    // Installed before the subject is imported, so captured references are wrapped too.
    const probe = installFsProbe();
    const coverage = mode === "counts" ? await startCoverage(isMeasured) : null;
    const { start } = (await import(`./subjects/${subjectName}.js`)) as { start: StartSubject };
    await coverage?.take();

    const run: Run = { probe, coverage, metrics: {}, problems: [], notifications: 0 };
    const info: Record<string, number> = {};
    const heapBaseline = mode === "heap" ? retainedHeap() : 0;
    let subject: Subject | null = null;

    const crawlStart = performance.now();
    await measure(run, "crawl", () => subject, {
        during: () => {
            subject = start({
                root: fixture.root,
                dotGit: fixture.dotGit,
                settleMs: SETTLE_MS,
                onNotify: () => {
                    run.notifications++;
                    probe.touch();
                },
            });
        },
        notify: true,
    });
    info["crawl.ms"] = Math.round(performance.now() - crawlStart - IDLE_MS);
    const crawl = run.metrics["crawl"]!;
    crawl["inotify.watches"] = inotifyWatches();

    if (mode === "heap") {
        crawl["heap.retained"] = retainedHeap() - heapBaseline;
    } else {
        for (const phase of PHASES) {
            await measure(run, phase.name, () => subject, { before: () => phase.mutate(fixture.root), notify: true });
            checkReported(run, fixture, subject!, phase.name, phase.expect);
        }
        run.metrics["remove-tree"]!["inotify.watches"] = inotifyWatches();
    }

    await measure(run, "close", () => null, { during: () => subject!.close(), notify: false });

    const output: ChildOutput = { metrics: run.metrics, info, problems: run.problems };
    fs.writeFileSync(outputFile, JSON.stringify(output));
    fs.rmSync(workdir, { recursive: true, force: true });
}

const [subjectName, mode, outputFile] = process.argv.slice(2);
if (!SUBJECTS.includes(subjectName as SubjectName) || !MODES.includes(mode as Mode) || outputFile === undefined) {
    throw new Error(`Usage: child.js <${SUBJECTS.join("|")}> <${MODES.join("|")}> <output>`);
}
await main(subjectName as SubjectName, mode as Mode, outputFile);
