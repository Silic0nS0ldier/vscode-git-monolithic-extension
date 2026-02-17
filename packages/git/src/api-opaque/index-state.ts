import type { GitContext } from "../cli/context.js";
import { type Result } from "../func-result.js";
import { readToBuffer, type ReadToErrors } from "../cli/helpers/read-to-buffer.js";

/**
 * Collects data related to git index state.
 * This is _not_ exhaustive and only serves as a heuristic.
 *
 * Note that while `git ls-files` _primarily_ operates off index state, certain metadata
 * (e.g. `eolinfo:worktree`) is derived from the worktree and thus may change without index
 * changes. Additionally, this out-of-index metadata is slower to lookup.
 */
export async function indexState(
    git: GitContext,
    cwd: string,
): Promise<Result<Buffer, ReadToErrors>>{
    return await readToBuffer(
        { cli: git.cli, cwd, timeout: 1_000 },
        ["ls-files", "--format=%(objectmode)␟%(objecttype)␟%(objectname)␟%(objectsize)␟%(stage)␟%(path)"],
        Infinity,
    );
}
