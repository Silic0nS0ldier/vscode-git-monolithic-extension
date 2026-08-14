import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { createError, createNonZeroExitError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, isOk, ok, unwrap } from "../../func-result.js";
import { readEffective } from "./read.js";

function contextReturning(value: string): { git: GitContext; calls: string[][] } {
    const calls: string[][] = [];
    return {
        calls,
        git: {
            cli: async (context, args) => {
                calls.push(args);
                if (context.stdout) {
                    intoStream(value).pipe(context.stdout);
                }
                return ok(void 0);
            },
            path: "",
            version: "UNSET",
        },
    };
}

function nonZeroExit(exitCode: number, stderr = ""): GitContext {
    return {
        // The stream backing `context.stdout` must still be ended, or `readToBuffer`'s
        // reader hangs waiting for it regardless of the CLI result.
        cli: async (context) => {
            context.stdout?.end();
            return err(createNonZeroExitError({
                args: [],
                cwd: "/fake",
                executablePath: "git",
                exitCode,
                signal: null,
                stderr,
                stdout: "",
            }));
        },
        path: "",
        version: "UNSET",
    };
}

test("Reads the effective value", async t => {
    const { calls, git } = contextReturning("template.txt\n");

    const res = await readEffective(git, "/fake", "commit.template");
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), "template.txt");
    }

    // No `--local`/`--global` scope flag: git resolves the key using its own precedence.
    t.deepEqual(calls, [["config", "--get", "commit.template"]]);
});

test("Resolves to undefined when the key is not set", async t => {
    const res = await readEffective(nonZeroExit(1), "/fake", "commit.template");
    t.true(isOk(res));
    if (isOk(res)) {
        t.is(unwrap(res), undefined);
    }
});

test("Propagates a real failure", async t => {
    const res = await readEffective(nonZeroExit(129), "/fake", "commit.template");
    t.true(isErr(res));
});

test("Rejects a key with no section, despite the exit code matching 'unset'", async t => {
    const git = nonZeroExit(1, "error: key does not contain a section: notasectionkey\n");

    const res = await readEffective(git, "/fake", "notasectionkey");
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GENERIC);
    }
});

test("Propagates errors unrelated to exit code", async t => {
    const git: GitContext = {
        cli: async (context) => {
            context.stdout?.end();
            return err(createError(ERROR_GENERIC, "boom"));
        },
        path: "",
        version: "UNSET",
    };

    const res = await readEffective(git, "/fake", "commit.template");
    t.true(isErr(res));
    if (isErr(res)) {
        t.is(unwrap(res).type, ERROR_GENERIC);
    }
});
