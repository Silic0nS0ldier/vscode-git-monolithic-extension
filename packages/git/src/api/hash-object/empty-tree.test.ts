import test from "ava";
import intoStream from "into-stream";
import type { GitContext } from "../../cli/context.js";
import { unwrapOk } from "../../errors.js";
import { ok } from "../../func-result.js";
import { emptyTree } from "./empty-tree.js";

test("Computes the repository-format empty tree", async t => {
    const hash = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
    const git: GitContext = {
        path: "",
        version: "",
        cli: async (context, args) => {
            t.is(context.input, "");
            t.deepEqual(args, ["hash-object", "-t", "tree", "--stdin"]);
            intoStream(hash + "\n").pipe(context.stdout!);
            return ok(undefined);
        },
    };
    t.is(unwrapOk(await emptyTree(git, "/repo")), hash);
});
