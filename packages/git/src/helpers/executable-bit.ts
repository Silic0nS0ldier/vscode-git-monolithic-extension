import { from_str_radix } from "monolithic-git-wasm";
import type { GitContext } from "../cli/context.js";
import { type ReadToErrors, readToString } from "../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../func-result.js";
import { matchPermissionDigits, permHasExecutableBit } from "./permission-digits.js";

/**
 * Runs the given git command and parses the mode/permission out of the first
 * output line to determine whether the executable bit is set. Returns
 * `undefined` when the command produced no output (e.g. the path is not in
 * the index or the object does not exist at the given commit-ish).
 */
export async function checkExecutableBitFromCommand(
    git: GitContext,
    cwd: string,
    args: string[],
): Promise<Result<boolean | undefined, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, args);

    if (isErr(result)) {
        return result;
    }

    const output = unwrap(result).trim();
    if (output === "") {
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
