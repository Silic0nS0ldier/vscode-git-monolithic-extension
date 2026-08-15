import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { ERROR_GENERIC } from "../../errors.js";
import { isErr, isOk, ok, unwrap } from "../../func-result.js";
import { size } from "./size.js";

const OBJECT = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

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

test("Asks git for the size of the named object", async t => {
    const { calls, git } = createContext("0\n");

    await size(git, "/fake", OBJECT);

    t.deepEqual(calls, [["cat-file", "-s", OBJECT]]);
});

test("Reports the size git prints, without its line ending", async t => {
    const { git } = createContext("1234\n");

    const res = await size(git, "/fake", OBJECT);
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), 1234);
    }
});

test("Reports an empty object as zero bytes", async t => {
    const { git } = createContext("0\n");

    const res = await size(git, "/fake", OBJECT);
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), 0);
    }
});

test("Reports an error rather than a partial number when git prints something else", async t => {
    const { git } = createContext("12 bytes\n");

    const res = await size(git, "/fake", OBJECT);
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GENERIC);
    }
});
