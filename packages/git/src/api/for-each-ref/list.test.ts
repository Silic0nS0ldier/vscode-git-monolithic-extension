import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { isOk, ok, unwrap } from "../../func-result.js";
import { list } from "./list.js";

const FORMAT = "%(refname) %(objectname) %(*objectname)";
const COMMIT = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const TAG_OBJECT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function createContext(stdout: string): { git: GitContext; calls: string[][] } {
    const calls: string[][] = [];

    return {
        calls,
        git: {
            cli: async (context, args) => {
                calls.push(args);
                if (context.stdout) {
                    intoStream(stdout).pipe(context.stdout);
                }
                return ok(void 0);
            },
            path: "",
            version: "UNSET",
        },
    };
}

test("Parses every ref namespace", async t => {
    const { git } = createContext(
        `refs/heads/main ${COMMIT} \n`
            + `refs/remotes/origin/main ${COMMIT} ${COMMIT}\n`
            + `refs/tags/v1.0.0 ${COMMIT} \n`,
    );

    const res = await list(git, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [
            { commit: COMMIT, kind: "head", name: "main" },
            { commit: COMMIT, kind: "remote-head", name: "origin/main", remote: "origin" },
            { commit: COMMIT, kind: "tag", name: "v1.0.0" },
        ]);
    }
});

test("Reports the dereferenced commit of an annotated tag", async t => {
    const { git } = createContext(`refs/tags/v1.0.0 ${TAG_OBJECT} ${COMMIT}\n`);

    const res = await list(git, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [{ commit: COMMIT, kind: "tag", name: "v1.0.0" }]);
    }
});

test("Skips refs outside the known namespaces", async t => {
    const { git } = createContext(`refs/stash ${COMMIT} \nrefs/heads/main ${COMMIT} \n`);

    const res = await list(git, "/fake");
    t.true(isOk(res));
    if (isOk(res)) {
        t.deepEqual(unwrap(res), [{ commit: COMMIT, kind: "head", name: "main" }]);
    }
});

test("Lists the default namespaces", async t => {
    const { calls, git } = createContext("");

    await list(git, "/fake");

    t.deepEqual(calls, [[
        "for-each-ref",
        "--format",
        FORMAT,
        "refs/heads",
        "refs/remotes",
        "refs/tags",
    ]]);
});

test("Applies every option", async t => {
    const { calls, git } = createContext("");

    await list(git, "/fake", { contains: "HEAD", count: 5, pattern: "refs/heads/feature*", sort: "committerdate" });

    t.deepEqual(calls, [[
        "for-each-ref",
        "--count=5",
        "--sort",
        "-committerdate",
        "--format",
        FORMAT,
        "refs/heads/feature*",
        "--contains",
        "HEAD",
    ]]);
});
