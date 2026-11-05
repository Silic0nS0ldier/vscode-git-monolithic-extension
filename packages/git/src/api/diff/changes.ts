import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { detach } from "../../helpers/detach.js";

export type Change = {
    status: "A" | "D" | "M" | "R" | "C" | "T" | "U";
    path: string;
    originalPath?: string;
};

/** Wraps `git diff --name-status -z --find-renames <from> <to> --`, without reading blob contents. */
export async function changes(
    git: GitContext,
    cwd: string,
    from: string,
    to: string,
    signal?: AbortSignal,
): Promise<Result<Change[], ReadToErrors>> {
    if (!from || !to || from.startsWith("-") || to.startsWith("-")) {
        return err(createError(ERROR_GENERIC, "Invalid diff revisions"));
    }
    // 10 MiB of paths accommodates large commits without buffering their patches.
    const result = await readToBuffer(
        { cli: git.cli, cwd, signal },
        ["diff", "--name-status", "-z", "--find-renames", from, to, "--"],
        10 * 1024 * 1024,
    );
    if (isErr(result)) return result;
    const output = unwrap(result).toString("utf-8");
    if (output && !output.endsWith("\0")) return err(createError(ERROR_GENERIC, "Unterminated diff changes"));
    const fields = output.split("\0");
    const entries: Change[] = [];
    for (let index = 0; index < fields.length - 1;) {
        const code = fields[index++];
        const status = code?.[0];
        const first = fields[index++];
        if (!first || !code || !/^(?:[ADMTU]|[RC]\d+)$/u.test(code)) {
            return err(createError(ERROR_GENERIC, "Malformed NUL-delimited diff changes"));
        }
        if (status === "R" || status === "C") {
            const renamed = fields[index++];
            if (!renamed) return err(createError(ERROR_GENERIC, "Missing renamed diff path"));
            entries.push({ status, originalPath: detach(first), path: detach(renamed) });
        } else if (status === "A" || status === "D" || status === "M" || status === "T" || status === "U") {
            entries.push({ status, path: detach(first) });
        } else {
            return err(createError(ERROR_GENERIC, `Unsupported diff status ${code}`));
        }
    }
    return ok(entries);
}
