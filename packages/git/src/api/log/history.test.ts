import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { unwrapOk } from "../../errors.js";
import { isErr, ok } from "../../func-result.js";
import { log } from "./mod.js";

test("Builds a bounded, UTF-8, rename-aware history query", async t => {
    const git: GitContext = {
        path: "",
        version: "2.50.0",
        cli: async (context, args) => {
            t.deepEqual(args, [
                "-c",
                "i18n.logOutputEncoding=UTF-8",
                "log",
                "-n51",
                "--format=%H%n%aN%n%aE%n%at%n%ct%n%P%n%B",
                "-z",
                "--skip=2",
                "abc123",
                "--shortstat",
                "--numstat",
                "--follow",
                "--",
                "renamed.txt",
            ]);
            intoStream("").pipe(context.stdout!);
            return ok(undefined);
        },
    };
    t.deepEqual(
        unwrapOk(
            await log(git, "/repo", {
                maxEntries: 51,
                skip: 2,
                hash: "abc123",
                shortStats: true,
                filePaths: true,
                follow: true,
                path: "renamed.txt",
            }),
        ),
        [],
    );
});

test("Rejects invalid paging inputs without executing git", async t => {
    const git: GitContext = {
        path: "",
        version: "",
        cli: async () => {
            t.fail("Invalid pagination must not run git");
            return ok(undefined);
        },
    };
    t.true(isErr(await log(git, "/repo", { maxEntries: -1 })));
    t.true(isErr(await log(git, "/repo", { skip: 1.5 })));
    t.true(isErr(await log(git, "/repo", { hash: "--all" })));
    t.true(isErr(await log(git, "/repo", { follow: true })));
});
