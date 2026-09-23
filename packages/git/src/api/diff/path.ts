import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import type { Result } from "../../func-result.js";
import { sanitizePath } from "../../helpers/sanitize-path.js";

/**
 * Changes to `path` that have not been staged, as a unified diff.
 * Wraps `git diff -- <path>`.
 */
export async function unstaged(git: GitContext, cwd: string, path: string): Promise<Result<string, ReadToErrors>> {
    return await readToString({ cli: git.cli, cwd }, ["diff", "--", sanitizePath(path)]);
}

/**
 * Changes to `path` that have been staged, as a unified diff.
 * Wraps `git diff --cached -- <path>`.
 */
export async function staged(git: GitContext, cwd: string, path: string): Promise<Result<string, ReadToErrors>> {
    return await readToString({ cli: git.cli, cwd }, ["diff", "--cached", "--", sanitizePath(path)]);
}
