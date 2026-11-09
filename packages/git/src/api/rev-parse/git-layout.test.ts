import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { createError, ERROR_GENERIC, unwrapOk } from "../../errors.js";
import { err, isErr, ok } from "../../func-result.js";
import { gitLayout } from "./git-layout.js";

test("Requests absolute common and object directories without trimming directory spaces", async t => {
    const signal = new AbortController().signal;
    const calls: string[][] = [];
    const git: GitContext = {
        path: "",
        version: "",
        cli: async (context, args) => {
            calls.push(args);
            t.is(context.cwd, "/repo");
            t.false(context.signal?.aborted);
            intoStream(args.includes("--git-common-dir") ? "/repo/.git  \n" : "/objects  \n").pipe(context.stdout!);
            return ok(undefined);
        },
    };
    t.deepEqual(unwrapOk(await gitLayout(git, "/repo", signal)), {
        commonDir: "/repo/.git  ",
        objectsDir: "/objects  ",
    });
    t.deepEqual(calls, [
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        ["rev-parse", "--path-format=absolute", "--git-path", "objects"],
    ]);
});

test("Preserves Git failures", async t => {
    const git: GitContext = {
        path: "",
        version: "",
        cli: async context => {
            intoStream("").pipe(context.stdout!);
            return err(createError(ERROR_GENERIC, "failed"));
        },
    };
    t.true(isErr(await gitLayout(git, "/repo")));
});

test("Preserves a newline at the end of a Git directory name", async t => {
    const git: GitContext = {
        path: "",
        version: "",
        cli: async (context, args) => {
            intoStream(args.includes("--git-common-dir") ? "/repo/.git\n\n" : "/objects\n\n").pipe(context.stdout!);
            return ok(undefined);
        },
    };
    t.deepEqual(unwrapOk(await gitLayout(git, "/repo")), { commonDir: "/repo/.git\n", objectsDir: "/objects\n" });
});

test("Rejects missing or relative common and object directories", async t => {
    for (const [common, objects] of [["", "/objects"], [".git\n", "/objects"], ["/repo/.git", "objects"]]) {
        const git: GitContext = {
            path: "",
            version: "",
            cli: async (context, args) => {
                intoStream(args.includes("--git-common-dir") ? common! : objects!).pipe(context.stdout!);
                return ok(undefined);
            },
        };
        t.true(isErr(await gitLayout(git, "/repo")));
    }
});
