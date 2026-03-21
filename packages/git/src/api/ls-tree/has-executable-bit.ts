import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { from_str_radix } from "monolithic-git-wasm";
import { matchPermissionDigits, permHasExecutableBit } from "../../helpers/permission-digits.js";

export async function hasExecutableBit(
    git: GitContext,
    cwd: string,
    filePath: string,
    commit_ish: string,
): Promise<Result<boolean|undefined, ReadToErrors>> {
    const result = await readToString(
        { cli: git.cli, cwd },
        ["ls-tree", commit_ish, filePath],
    );

    if (isErr(result)) {
        return result;
    }

    const output = unwrap(result).trim();
    if (output === "") {
        // No output means the file doesn't exist at the given commit-ish, so we return undefined
        return ok(undefined);
    }

    const permResult = matchPermissionDigits(output);
    if (isErr(permResult)) {
        return permResult;
    }
    const perm = unwrap(permResult);

    try {
        const permNum = from_str_radix(perm, 8);
        return ok(permHasExecutableBit(permNum));
    } catch (e) {
        return err(createError(ERROR_GENERIC, `Could not parse permission octal: "${perm}"`));
    }
}
