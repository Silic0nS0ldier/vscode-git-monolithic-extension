import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../cli/context.js";
import { isOk, ok, unwrap } from "../func-result.js";
import { commit, show } from "./show.js";

test("Basic case", async t => {
    const res = await show(
        {
            cli: async (context) => {
                if (context.stdout) {
                    intoStream("content").pipe(context.stdout);
                }
                return ok(void 0);
            },
            path: "PATH",
            version: "VERSION",
        },
        "/cwd",
        "relative",
    );
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res).toString("utf-8"), "content");
    }
});

test("Reads a single commit", async t => {
    const calls: string[][] = [];
    const git: GitContext = {
        cli: async (context, args) => {
            calls.push(args);
            if (context.stdout) {
                intoStream(
                    "4b825dc642cb6eb9a060e54bf8d69288fbee4904\nAlice\nalice@example.com\n1\n2\n\nSubject\n\0",
                ).pipe(context.stdout);
            }
            return ok(void 0);
        },
        path: "PATH",
        version: "VERSION",
    };

    const res = await commit(git, "/cwd", "HEAD");
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res)?.message, "Subject");
    }

    t.deepEqual(calls, [["show", "-s", "--format=%H%n%aN%n%aE%n%at%n%ct%n%P%n%B", "-z", "HEAD"]]);
});

test("Resolves to nothing when the output does not parse", async t => {
    const res = await commit(
        {
            cli: async (context) => {
                if (context.stdout) {
                    intoStream("").pipe(context.stdout);
                }
                return ok(void 0);
            },
            path: "PATH",
            version: "VERSION",
        },
        "/cwd",
        "HEAD",
    );
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), undefined);
    }
});
