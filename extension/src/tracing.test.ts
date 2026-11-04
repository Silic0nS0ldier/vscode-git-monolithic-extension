import test from "ava";
import type { LogOutputChannel } from "vscode";
import { type Callsite, info, setCallsiteFilter, setOutputChannel, unsetOutputChannel, warn } from "./tracing.js";

const logged: string[] = [];
const channel = {
    info: (msg: string) => logged.push(`info ${msg}`),
    warn: (msg: string) => logged.push(`warn ${msg}`),
} as unknown as LogOutputChannel;

const watch: Callsite = { file: "extension/src/watch/watch.ts", line: 12, column: 5 };
const git: Callsite = { file: "extension/src/git.ts", line: 120, column: 9 };

test.beforeEach(() => {
    logged.length = 0;
    setOutputChannel(channel);
});

test.afterEach.always(() => {
    unsetOutputChannel();
    setCallsiteFilter(undefined);
});

test.serial("logs every call when no filter is set", t => {
    info("a", watch);
    warn("b", git);
    info("c");
    t.deepEqual(logged, ["info a", "warn b", "info c"]);
});

test.serial("treats a list containing `.*` as no filter, without matching against it", t => {
    // The bundle never produces this file name; it is what `.*` would fail to match.
    const multiline: Callsite = { file: "extension/src/new\nline.ts", line: 1, column: 1 };
    setCallsiteFilter(["nothing", ".*"]);
    info("a", multiline);
    setCallsiteFilter(["(?:.*)"]);
    info("b", multiline);
    t.deepEqual(logged, ["info a"]);
});

test.serial("logs only calls whose location matches the filter", t => {
    setCallsiteFilter(["extension/src/watch/.*"]);
    info("a", watch);
    warn("b", git);
    t.deepEqual(logged, ["info a"]);
});

test.serial("logs calls whose location matches any pattern", t => {
    setCallsiteFilter(["extension/src/watch/.*", "extension/src/git\\.ts:120:9"]);
    info("a", watch);
    warn("b", git);
    setCallsiteFilter(["extension/src/watch/.*", "extension/src/git\\.ts:121:.*"]);
    info("c", watch);
    warn("d", git);
    t.deepEqual(logged, ["info a", "warn b", "info c"]);
});

test.serial("logs no calls with a call site for an empty list", t => {
    setCallsiteFilter([]);
    info("a", watch);
    info("b");
    t.deepEqual(logged, ["info b"]);
});

test.serial("matches the filter against the whole location", t => {
    setCallsiteFilter(["extension/src/git\\.ts"]);
    info("a", git);
    setCallsiteFilter(["extension/src/git\\.ts:120:9"]);
    info("b", git);
    t.deepEqual(logged, ["info b"]);
});

test.serial("always logs calls without a call site", t => {
    setCallsiteFilter(["nothing"]);
    info("a");
    t.deepEqual(logged, ["info a"]);
});

test.serial("applies a changed filter to call sites matched before", t => {
    setCallsiteFilter([".*"]);
    info("a", watch);
    setCallsiteFilter(["extension/src/git\\.ts:.*"]);
    info("b", watch);
    t.deepEqual(logged, ["info a"]);
});

test.serial("rejects a list with an invalid pattern, keeping the current filter", t => {
    setCallsiteFilter(["extension/src/git\\.ts:.*"]);
    t.throws(() => setCallsiteFilter(["extension/src/watch/.*", "["]), { instanceOf: SyntaxError });
    info("a", watch);
    info("b", git);
    t.deepEqual(logged, ["info b"]);
});
