import test from "ava";
import { isErr, unwrap } from "../../func-result.js";
import { inspect } from "node:util";
import { tempGitRepo, gitCtx } from "../helpers.it.stub.js";
import { head } from "./head.js";

test(head.name, async t => {
    await using repo = await tempGitRepo(true);
    
    const result = await head(gitCtx, repo.path);
    if (isErr(result)) {
        t.fail(`Expected head to succeed, but it failed with: ${inspect(unwrap(result))}`);
        return;
    }
    const headHash = unwrap(result);
    t.is(headHash?.length, 40, "Expected head hash to be 40 characters long");
});
