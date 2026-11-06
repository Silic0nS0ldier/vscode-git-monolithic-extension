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

function at(relative: string): { path: ReturnType<typeof p>; relative: RelativePath } {
    return { path: p(`/r/${relative}`), relative: relative as RelativePath };
}

test("a move is relocatable unless a pattern could apply differently at either place", t => {
    const relocatable = (patterns: string[], from: string, to: string) =>
        gitignore({ patterns }).relocatable!(at(from), at(to));
    t.true(relocatable([], "a", "b"));
    t.true(relocatable(["*.log", "build/"], "a/b", "c"), "basename patterns");
    t.true(relocatable(["/top", "x/y"], "a/b", "c/d"), "anchored at other depths");
    t.false(relocatable(["x/y/z"], "a/b", "x/y"), "may match an entry where it moved to");
    t.false(relocatable(["x/y/z"], "x/y", "a/b"), "may have matched an entry where it moved from");
    t.false(relocatable(["*.log"], "a/b", "c.log/d"), "ignored on the way to where it moved");
    t.false(relocatable(["a/**/b"], "a/b", "c/d"), "`**` may match at any depth");
    t.false(relocatable([" #lead/ing"], "a", "b"), "a leading space does not start a comment");
    t.true(relocatable(["#lead/ing"], "a", "b"), "a comment");
});

test("rules from a .gitignore within a moved directory are not relocatable", async t => {
    const a = await visit(gitignore(), "a", { ".gitignore": "file" }, { ".gitignore": "*.tmp" });
    t.false(a.child!.relocatable!(at("a"), at("b")));
    t.false(a.child!.relocatable!(at("a/sub"), at("b/sub")));
});
