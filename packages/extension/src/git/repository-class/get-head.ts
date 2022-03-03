import { head as revParseHead } from "monolithic-git-interop/api/rev-parse/head";
import { head as symbolicRefHead } from "monolithic-git-interop/api/symbolic-ref/head";
import { GitContext } from "monolithic-git-interop/cli";
import { isErr, isOk, unwrap } from "monolithic-git-interop/util/result";
import { Ref, RefType } from "../../api/git.js";

export async function getHEAD(context: GitContext, repoRoot: string): Promise<Ref> {
    const symbolicRefHeadResult = await symbolicRefHead(context, repoRoot);

    if (isOk(symbolicRefHeadResult)) {
        const headRef = unwrap(symbolicRefHeadResult);
        if (headRef) {
            return { commit: undefined, name: headRef, type: RefType.Head };
        }
    }

    const revParseHeadResult = await revParseHead(context, repoRoot);

    if (isOk(revParseHeadResult)) {
        const commitMaybe = unwrap(revParseHeadResult);
        if (commitMaybe) {
            return { commit: commitMaybe, name: undefined, type: RefType.Head };
        }
    }

    throw {
        attempts: [
            isErr(symbolicRefHeadResult) && unwrap(symbolicRefHeadResult),
            isErr(revParseHeadResult) && unwrap(revParseHeadResult),
        ],
        message: "Could not get head",
    };
}
