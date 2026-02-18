import test from "ava";
import { isErr, unwrap } from "../../func-result.js";
import { inspect } from "node:util";
import { tempGitRepo, gitCtx, services } from "../helpers.it.stub.js";
import { showToplevel } from "./show-toplevel.js";

test(showToplevel.name, async t => {
    await using repo = await tempGitRepo();
    const result = await showToplevel(gitCtx, repo.path, services);
    if (isErr(result)) {
        t.fail(`Expected showToplevel to succeed, but it failed with: ${inspect(unwrap(result))}`);
        return;
    }
    const topLevelPath = unwrap(result);
    t.is(topLevelPath, repo.path);
});
