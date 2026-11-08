import path from "node:path";
import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";

export type GitLayout = { commonDir: string; objectsDir: string };

export async function gitLayout(
    git: GitContext,
    cwd: string,
    signal?: AbortSignal,
): Promise<Result<GitLayout, ReadToErrors>> {
    async function readPath(args: string[]): Promise<Result<string, ReadToErrors>> {
        const result = await readToString({ cli: git.cli, cwd, signal }, [
            "rev-parse",
            "--path-format=absolute",
            ...args,
        ]);
        if (isErr(result)) return result;
        const value = unwrap(result).replace(process.platform === "win32" ? /\r?\n$/u : /\n$/u, "");
        if (!path.isAbsolute(value)) return err(createError(ERROR_GENERIC, "Invalid Git directory"));
        return ok(value);
    }

    const common = await readPath(["--git-common-dir"]);
    if (isErr(common)) return common;
    const objects = await readPath(["--git-path", "objects"]);
    if (isErr(objects)) return objects;
    return ok({ commonDir: unwrap(common), objectsDir: unwrap(objects) });
}
