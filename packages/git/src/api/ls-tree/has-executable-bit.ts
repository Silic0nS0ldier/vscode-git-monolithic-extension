import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";

const pattern = /^(?<perm>\d{6}).*$/;

// From https://stackoverflow.com/a/60128480
const execBitmask = 0o111;

export async function hasExecutableBit(
    git: GitContext,
    cwd: string,
    filePath: string,
    commit_ish: string,
): Promise<Result<boolean, ReadToErrors>> {
    const result = await readToString(
        { cli: git.cli, cwd },
        ["ls-tree", commit_ish, filePath],
    );

    if (isErr(result)) {
        return result;
    }

    const output = unwrap(result).trim();
    const matches = pattern.exec(output);

    if (matches == null) {
        return err(createError(ERROR_GENERIC, `Could not parse output: "${output}"`));
    }

    const perm = matches.groups!.perm as string;
    const permNum = parseInt(perm, 8);

    if (Number.isNaN(permNum)) {
        return err(createError(ERROR_GENERIC, `Could not parse permission octal: "${perm}"`));
    }

    console.log(permNum, execBitmask)

    return ok(!!(permNum & execBitmask));
}
