import test from "ava";
import { deriveKeys, moduleGraphDigest, sha256 } from "./keys.js";

test("sha256 matches the known digest of an empty input", (t) => {
    t.is(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("moduleGraphDigest changes when any single input changes", (t) => {
    const a = Buffer.from("a");
    const b = Buffer.from("b");
    const c = Buffer.from("c");
    const base = moduleGraphDigest(a, b, c);

    t.not(moduleGraphDigest(b, b, c), base);
    t.not(moduleGraphDigest(a, a, c), base);
    t.not(moduleGraphDigest(a, b, a), base);
});

test("moduleGraphDigest distinguishes content moved across file boundaries", (t) => {
    t.not(
        moduleGraphDigest(Buffer.from("ab"), Buffer.from("c"), Buffer.from("")),
        moduleGraphDigest(Buffer.from("a"), Buffer.from("bc"), Buffer.from("")),
    );
});

test("deriveKeys nests the restore keys from most to least specific", (t) => {
    const { primary, restoreKeys } = deriveKeys("Linux-X64", "graph", "pnpm");

    t.is(primary, "bazel-hidden-lockfile-v1-Linux-X64-graph-pnpm");
    t.deepEqual(restoreKeys, [
        "bazel-hidden-lockfile-v1-Linux-X64-graph-",
        "bazel-hidden-lockfile-v1-Linux-X64-",
    ]);
    for (const key of restoreKeys) {
        t.true(primary.startsWith(key));
    }
});

test("deriveKeys never produces a key usable on another platform", (t) => {
    const { primary, restoreKeys } = deriveKeys("Linux-X64", "graph", "pnpm");
    const other = deriveKeys("Linux-ARM64", "graph", "pnpm");

    for (const key of restoreKeys) {
        t.false(other.primary.startsWith(key));
    }
    t.false(primary.startsWith(other.restoreKeys[1]!));
});

test("deriveKeys changes the primary key when only pnpm-lock.yaml changes", (t) => {
    const a = deriveKeys("Linux-X64", "graph", "pnpm-a");
    const b = deriveKeys("Linux-X64", "graph", "pnpm-b");

    t.not(a.primary, b.primary);
    t.deepEqual(a.restoreKeys, b.restoreKeys);
});
