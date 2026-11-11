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
        cli: (context, args) => {
            t.deepEqual(args, ["diff", "--raw", "-z", "--find-renames", "HEAD^", "HEAD", "--"]);
            intoStream(
                ":100644 100644 aaaaaaa bbbbbbb M\0file.txt\0"
                    + ":100644 100755 aaaaaaa bbbbbbb R100\0old\tfile\0new\nfile\0"
                    + ":160000 000000 aaaaaaa 0000000 D\0deleted\0",
            ).pipe(context.stdout!);
            return Promise.resolve(ok(undefined));
        },
    };
    t.deepEqual(unwrapOk(await changes(git, "/repo", "HEAD^", "HEAD")), [
        { status: "M", path: "file.txt", originalMode: "100644", mode: "100644" },
        { status: "R", originalPath: "old\tfile", path: "new\nfile", originalMode: "100644", mode: "100755" },
        { status: "D", path: "deleted", originalMode: "160000", mode: "000000" },
    ]);
});

test("Reports truncated changes", async t => {
    const git: GitContext = {
        path: "",
        version: "",
        cli: context => {
            intoStream(":100644 100644 aaaaaaa bbbbbbb R100\0old\0").pipe(context.stdout!);
            return Promise.resolve(ok(undefined));
        },
    };
    t.true(isErr(await changes(git, "/repo", "HEAD^", "HEAD")));
});

test("Rejects changes without a raw header", async t => {
    const git: GitContext = {
        path: "",
        version: "",
        cli: context => {
            intoStream("M\0file.txt\0").pipe(context.stdout!);
            return Promise.resolve(ok(undefined));
        },
    };
    t.true(isErr(await changes(git, "/repo", "HEAD^", "HEAD")));
});
