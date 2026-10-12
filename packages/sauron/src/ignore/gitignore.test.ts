import test from "ava";
import { p } from "../backend/fake.stub.js";
import type { EntryKind, FileName, RelativePath } from "../path.js";
import { gitignore } from "./gitignore.js";
import { ignoreAll, ignorePaths, type Ignorer, type IgnoreScope } from "./mod.js";

function visit(
    ignorer: Ignorer,
    relative: string | null,
    entries: Record<string, EntryKind>,
    files: Record<string, string> = {},
): Promise<IgnoreScope> {
    return Promise.resolve(ignorer.visit({
        path: p(relative === null ? "/r" : `/r/${relative}`),
        relative: relative as RelativePath | null,
        entries: new Map(Object.entries(entries) as [FileName, EntryKind][]),
        readText: async name => files[name] ?? null,
        signal: new AbortController().signal,
    }));
}

function sorted(names: ReadonlySet<FileName> | undefined): string[] {
    return [...names ?? []].sort();
}

test("directory-only patterns do not match files", async t => {
    const scope = await visit(gitignore(), null, { ".gitignore": "file", build: "directory", out: "file" }, {
        ".gitignore": "build/\nout/",
    });
    t.deepEqual(sorted(scope.ignored), ["build"]);
});

test("a nested .gitignore can re-include what a parent excluded", async t => {
    const root = await visit(gitignore(), null, { ".gitignore": "file", sub: "directory" }, {
        ".gitignore": "*.log",
    });
    const sub = await visit(root.child!, "sub", { ".gitignore": "file", "keep.log": "file", "drop.log": "file" }, {
        ".gitignore": "!keep.log",
    });
    t.deepEqual(sorted(sub.ignored), ["drop.log"]);
});

test("nested patterns are anchored to their own directory", async t => {
    const ignorer = gitignore();
    const root = await visit(ignorer, null, { a: "directory" });
    const a = await visit(root.child ?? ignorer, "a", { ".gitignore": "file", b: "directory", c: "directory" }, {
        ".gitignore": "/b",
    });
    const c = await visit(a.child!, "a/c", { b: "directory" });
    t.deepEqual(sorted(a.ignored), ["b"]);
    t.deepEqual(sorted(c.ignored), []);
});

test("extra root patterns apply everywhere below the root", async t => {
    const scope = await visit(gitignore({ patterns: ["*.tmp"] }), "deep/dir", { "x.tmp": "file", "x.ts": "file" });
    t.deepEqual(sorted(scope.ignored), ["x.tmp"]);
});

test("ignoreAll unions ignored entries and triggers", async t => {
    const combined = ignoreAll(gitignore(), ignorePaths([p("/r/.git")]));
    const scope = await visit(combined, null, { ".git": "directory", ".gitignore": "file", "a.log": "file" }, {
        ".gitignore": "*.log",
    });
    t.deepEqual(sorted(scope.ignored), [".git", "a.log"]);
    t.deepEqual(sorted(combined.triggers), [".gitignore"]);
    t.not(scope.child, undefined);
});
