import type { GitContext } from "../cli/context.js";
import { type ReadToErrors, readToBuffer } from "../cli/helpers/read-to-buffer.js";
import { isErr, type Result } from "../func-result.js";

export async function show(git: GitContext, cwd: string, object: string): Promise<Result<Buffer, ReadToErrors>> {
    const args = ["show", "--textconv", object];
    const result = await readToBuffer({ cli: git.cli, cwd }, args, Infinity);
    
    if (isErr(result)) {
        // TODO(Silic0nS0ldier): Classify as a wrong case error if stderr contains
        // "exists on disk, but not in"
        return result;
    }

    return result;
}