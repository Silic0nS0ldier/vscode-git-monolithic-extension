import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { unwrapOk } from "../../errors.js";
import { isErr, ok } from "../../func-result.js";
import { changes } from "./changes.js";

test("Parses NUL-delimited changes and rename paths", async t => {
    const git: GitContext = {
        path: "",
        version: "",
        cli: async (context, args) => {
            t.deepEqual(args, ["diff", "--name-status", "-z", "--find-renames", "HEAD^", "HEAD", "--"]);
            intoStream("M\0file.txt\0R100\0old\tfile\0new\nfile\0D\0deleted\0").pipe(context.stdout!);
            return ok(undefined);
        },
    };
    t.deepEqual(unwrapOk(await changes(git, "/repo", "HEAD^", "HEAD")), [
        { status: "M", path: "file.txt" },
        { status: "R", originalPath: "old\tfile", path: "new\nfile" },
        { status: "D", path: "deleted" },
    ]);
});

test("Reports truncated changes", async t => {
    const git: GitContext = {
        path: "",
        version: "",
        cli: async context => {
            intoStream("R100\0old\0").pipe(context.stdout!);
            return ok(undefined);
        },
    };
    t.true(isErr(await changes(git, "/repo", "HEAD^", "HEAD")));
});
