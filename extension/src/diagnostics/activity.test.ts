import test from "ava";
import { createActivityRecorder, diagnosticGitCommand } from "./activity.js";

test("extracts Git subcommands without retaining global options or arguments", t => {
    t.is(
        diagnosticGitCommand([
            "-c",
            "credential.helper=secret value",
            "--literal-pathspecs",
            "status",
            "--short",
            "/private/path",
        ]),
        "status",
    );
    t.is(diagnosticGitCommand(["-C", "/private/path", "rev-parse", "--git-dir"]), "rev-parse");
    t.is(diagnosticGitCommand(["--unknown-global-option", "private-repository-name"]), "unknown");
});

test("records active and completed activity without retaining repository paths or arguments", t => {
    let now = 1_000;
    const recorder = createActivityRecorder(10, () => now);
    const repository = "/home/a/private/repository";
    const activity = recorder.beginGitInvocation(repository, "CMD_0_1", "status");
    activity.setPid(42);

    now = 1_250;
    const active = recorder.snapshot();
    t.deepEqual(active.active, [
        {
            durationMs: 250,
            id: 0,
            kind: "git",
            label: "CMD_0_1:status",
            pid: 42,
            repository: "repository-1",
            startedAt: 1_000,
        },
    ]);
    t.false(JSON.stringify(active).includes(repository));

    now = 1_400;
    activity.finish("succeeded");
    const completed = recorder.snapshot();
    t.is(completed.active.length, 0);
    t.deepEqual(completed.recent, [
        {
            durationMs: 400,
            id: 0,
            kind: "git",
            label: "CMD_0_1:status",
            outcome: "succeeded",
            pid: 42,
            repository: "repository-1",
            startedAt: 1_000,
        },
    ]);
});

test("uses bounded, stable repository aliases and activity history", t => {
    let now = 0;
    const recorder = createActivityRecorder(2, () => now);

    for (let i = 0; i < 3; i++) {
        const activity = recorder.beginOperation(`/private/repo-${i % 2}`, `Operation-${i}`);
        now++;
        activity.finish("succeeded");
    }

    const snapshot = recorder.snapshot();
    t.deepEqual(snapshot.recent.map(activity => activity.id), [1, 2]);
    t.deepEqual(snapshot.recent.map(activity => activity.repository), ["repository-2", "repository-1"]);
    t.true(snapshot.recent.every(activity => !activity.repository?.startsWith("/")));
});

test("ignores unsafe labels and repeated completion", t => {
    let now = 0;
    const recorder = createActivityRecorder(10, () => now);
    const activity = recorder.beginGitInvocation(undefined, "CMD/secret/path", "status --token secret");

    now = 5;
    activity.finish("failed");
    now = 50;
    activity.finish("succeeded");

    t.deepEqual(recorder.snapshot().recent[0], {
        durationMs: 5,
        id: 0,
        kind: "git",
        label: "unknown:unknown",
        outcome: "failed",
        startedAt: 0,
    });
});
