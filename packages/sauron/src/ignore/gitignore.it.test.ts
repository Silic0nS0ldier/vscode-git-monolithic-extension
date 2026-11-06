/**
 * Compares what `gitignore()` keeps with what git does, by crawling a real repository as the watcher would (never
 * descending into an ignored directory) and listing the untracked files git does not ignore.
 */
import { runfiles } from "@bazel/runfiles";
import { isErr, unwrap } from "monolithic-git-interop/util/result";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { type AbsolutePath, absolutePath, type EntryKind, type FileName, type RelativePath } from "../path.js";
import { gitignore } from "./gitignore.js";
import type { Ignorer } from "./mod.js";

const rlocation = process.env["GIT_BIN_RLOCATION"];
assert.ok(rlocation, "GIT_BIN_RLOCATION is provided by the js_test `env` attribute");
const gitPath = runfiles.resolve(rlocation);

let tmp: string;
let env: NodeJS.ProcessEnv;

before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sauron-gitignore-"));
    // Keeps the user's and system's ignore files out.
    env = { ...process.env, HOME: tmp, XDG_CONFIG_HOME: tmp, GIT_CONFIG_NOSYSTEM: "1" };
});

after(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
});

function absolute(raw: string): AbsolutePath {
    const result = absolutePath(raw);
    assert.ok(!isErr(result));
    return unwrap(result);
}

function git(cwd: string, args: string[]): string {
    return execFileSync(gitPath, args, { cwd, env, encoding: "utf8" });
}

async function crawl(root: string, ignorer: Ignorer): Promise<string[]> {
    const kept: string[] = [];
    async function walk(ignorer: Ignorer, relative: string | null): Promise<void> {
        const dir = relative === null ? root : path.join(root, relative);
        const listed = await fs.readdir(dir, { withFileTypes: true });
        const entries = new Map<FileName, EntryKind>(
            listed
                .filter(d => relative !== null || d.name !== ".git")
                .map(d => [d.name as FileName, d.isDirectory() ? "directory" : "file"]),
        );
        const scope = await ignorer.visit({
            path: absolute(dir),
            relative: relative as RelativePath | null,
            entries,
            signal: new AbortController().signal,
            readText: name => fs.readFile(path.join(dir, name), "utf8").catch(() => null),
        });
        for (const [name, kind] of entries) {
            if (scope.ignored.has(name)) {
                continue;
            }
            const child = relative === null ? name : `${relative}/${name}`;
            if (kind === "directory") {
                await walk(scope.child ?? ignorer, child);
            } else {
                kept.push(child);
            }
        }
    }
    await walk(ignorer, null);
    return kept.sort();
}

type Case = {
    /** Empty files to create. */
    readonly files: readonly string[];
    /** Ignore files by path, `.git/info/exclude` included. */
    readonly ignores: Readonly<Record<string, string>>;
};

async function compare(name: string, { files, ignores }: Case): Promise<void> {
    const root = await fs.mkdtemp(path.join(tmp, "repo-"));
    git(root, ["init", "--quiet", "--template="]);
    for (const [file, text] of [...files.map(f => [f, ""] as const), ...Object.entries(ignores)]) {
        await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
        await fs.writeFile(path.join(root, file), text);
    }
    const expected = git(root, ["-c", "core.quotePath=false", "ls-files", "--others", "--exclude-standard", "-z"])
        .split("\0")
        .filter(f => f !== "")
        .sort();
    const exclude = ignores[".git/info/exclude"];
    const actual = await crawl(root, gitignore(exclude === undefined ? {} : { patterns: [exclude] }));
    assert.deepEqual(actual, expected, name);
}

const CASES: Readonly<Record<string, Case>> = {
    "a pattern without a slash matches at any depth": {
        files: ["a.log", "x/b.log", "x/y/c.log", "x/keep"],
        ignores: { ".gitignore": "*.log" },
    },
    "a directory-only pattern does not match files": {
        files: ["a/build/x", "build/y", "a/b/build"],
        ignores: { ".gitignore": "build/" },
    },
    "a middle slash anchors the pattern": {
        files: ["doc/frotz/x", "a/doc/frotz/y"],
        ignores: { ".gitignore": "doc/frotz" },
    },
    "nested patterns are anchored to their own directory": {
        files: ["a/b/x", "a/c/b/y", "a/t", "a/u/t", "t"],
        ignores: { "a/.gitignore": "b/x\n/c/b\n/t" },
    },
    "nested directory-only anchored patterns": {
        files: ["s/a/b/x", "s/q/a/b/y"],
        ignores: { "s/.gitignore": "a/b/" },
    },
    "a leading `**/` matches in all directories": {
        files: ["foo", "a/foo", "a/b/foo/x", "a/bar"],
        ignores: { ".gitignore": "**/foo" },
    },
    "a middle `/**/` matches zero or more directories": {
        files: ["a/b", "a/x/b", "a/x/y/b", "c/a/b"],
        ignores: { ".gitignore": "a/**/b" },
    },
    "a trailing `/**` matches everything inside": {
        files: ["abc/x", "abc/d/e", "x/abc/y"],
        ignores: { ".gitignore": "abc/**" },
    },
    "`**` in a nested .gitignore is anchored to it": {
        files: ["s/a/q/b", "a/q/b", "s/t/a/q/b"],
        ignores: { "s/.gitignore": "a/**/b" },
    },
    "`**` with negation": {
        files: ["a/x/keep", "a/x/drop", "a/y/z/keep"],
        ignores: { ".gitignore": "a/**\n!a/**/\n!keep" },
    },
    "a lone `**` in a nested .gitignore": {
        files: ["a", "b/c", "b/d/e"],
        ignores: { "b/.gitignore": "**\n!.gitignore" },
    },
    "wildcards and character classes": {
        files: ["a1", "a2", "ab", "abc", "x1", "xa"],
        ignores: { ".gitignore": "a[0-9]\na?c\nx[!0-9]" },
    },
    "a file in an excluded directory cannot be re-included": {
        files: ["foo/bar", "foo/baz"],
        ignores: { ".gitignore": "foo/\n!foo/bar" },
    },
    "a nested .gitignore in an excluded directory is not read": {
        files: ["foo/bar"],
        ignores: { ".gitignore": "foo/", "foo/.gitignore": "!bar" },
    },
    "the contents of an excluded directory can be re-included": {
        files: ["foo/bar", "foo/baz"],
        ignores: { ".gitignore": "/foo/*\n!/foo/bar" },
    },
    "a directory excluded by a wildcard can be re-included in the same file": {
        files: ["a/b/c/d", "a/e"],
        ignores: { ".gitignore": "a/*\n!a/b/" },
    },
    "a nested .gitignore can re-include a file": {
        files: ["a/x.log", "a/b/x.log", "a/b/keep.log", "y.log"],
        ignores: { ".gitignore": "*.log", "a/b/.gitignore": "!keep.log" },
    },
    "a nested .gitignore can exclude what a parent re-included": {
        files: ["a/k.log", "a/b/k.log"],
        ignores: { ".gitignore": "*.log\n!k.log", "a/b/.gitignore": "k.log" },
    },
    "the deepest of three .gitignore files decides": {
        files: ["x.log", "a/y.log", "a/b/drop.log", "a/b/c/keep.log"],
        ignores: { ".gitignore": "*.log", "a/.gitignore": "!*.log", "a/b/.gitignore": "drop.log" },
    },
    "a nested .gitignore can re-include a directory a parent excluded": {
        files: ["v/w/x", "v/w/y/z", "v/u/y"],
        ignores: { ".gitignore": "v/*", "v/.gitignore": "!w/" },
    },
    "a parent's rules still apply inside a directory a nested .gitignore re-included": {
        files: ["v/w/x", "v/w/x.log", "v/w/y/z.log", "v/w/y/z"],
        ignores: { ".gitignore": "v/*\n*.log\nv/w/y/z", "v/.gitignore": "!w/" },
    },
    "directories excluded and re-included at several depths": {
        files: ["a/w/b/x", "a/w/c/x", "a/u/x"],
        ignores: { ".gitignore": "a/*\na/*/*", "a/.gitignore": "!w/\n!w/b/" },
    },
    "a re-included directory with glob characters in its name": {
        files: ["v/[w]/x", "v/*/y", "v/a?/z", "v/b\\c/q", "v/w/r"],
        ignores: { ".gitignore": "v/*\nv/*/*\n!v/*/x", "v/.gitignore": "!*/\n!*/[qyz]" },
    },
    "a .gitignore applies even if it is ignored": {
        files: ["sub/x.tmp", "sub/y"],
        ignores: { ".gitignore": ".gitignore", "sub/.gitignore": "*.tmp" },
    },
    "a directory-only negation keeps a directory but not a file": {
        files: ["cache", "d/cache/x"],
        ignores: { ".gitignore": "cache\n!cache/" },
    },
    "trailing spaces are dropped unless escaped": {
        files: ["a ", "a", "b ", "b"],
        ignores: { ".gitignore": "a \nb\\ " },
    },
    "escaped `#` and `!` are literal": {
        files: ["#x", "!y", "z"],
        ignores: { ".gitignore": "\\#x\n\\!y\n# z" },
    },
    "CRLF line endings": {
        files: ["a.log", "b", "c"],
        ignores: { ".gitignore": "*.log\r\nb\r\n" },
    },
    "non-ASCII names": {
        files: ["é/x.log", "ü", "ö"],
        ignores: { ".gitignore": "*.log\nü" },
    },
    "names with spaces": {
        files: ["a b/c", "a"],
        ignores: { ".gitignore": "a b/" },
    },
    "root patterns apply before .gitignore files": {
        files: ["a.tmp", "b/c.tmp", "b/keep.tmp"],
        ignores: { ".git/info/exclude": "*.tmp", "b/.gitignore": "!keep.tmp" },
    },
};

for (const [name, c] of Object.entries(CASES)) {
    test(name, () => compare(name, c));
}
