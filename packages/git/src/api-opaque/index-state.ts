import type { GitContext } from "../cli/context.js";
import { type Result } from "../func-result.js";
import { readToBuffer, type ReadToErrors } from "../cli/helpers/read-to-buffer.js";

export async function indexState(
    git: GitContext,
    cwd: string,
): Promise<Result<Buffer, ReadToErrors>>{
    return await readToBuffer(
        { cli: git.cli, cwd},
        ["ls-files", "--format=%(objectmode)␟%(objecttype)␟%(objectname)␟%(objectsize)␟%(stage)␟%(eolinfo:index)␟%(eolinfo:worktree)␟%(eolattr)␟%(path)"],
        Infinity,
    );
}
