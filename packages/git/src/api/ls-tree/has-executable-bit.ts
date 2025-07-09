import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";

// https://www.npmjs.com/package/@rollup/plugin-wasm
import wasm, { from_str_radix } from "./wasm.wasm";
import wasmInit from "./wasm.js";

await wasmInit(await wasm());
from_str_radix("777", 8);

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

    let permNum = (() => {
        try {
            return ok(from_str_radix(perm, 8));
        } catch (e) {
            return err(createError(ERROR_GENERIC, `Could not parse permission octal: "${perm}"`));
        }
    })();

    if (isErr(permNum)) {
        return permNum;
    }
    //...

    if (Number.isNaN(permNum)) {
        return err(createError(ERROR_GENERIC, `Could not parse permission octal: "${perm}"`));
    }

    console.log(permNum, execBitmask)

    return ok(!!(permNum & execBitmask));
}
