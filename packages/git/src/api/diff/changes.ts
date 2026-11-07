import type { GitContext } from "../../cli/context.js";
import { readToBuffer, type ReadToErrors } from "../../cli/helpers/read-to-buffer.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { detach } from "../../helpers/detach.js";

export type Change = {
    status: "A" | "D" | "M" | "R" | "C" | "T" | "U";
    path: string;
    originalPath?: string;
    /** Octal mode before the change, `000000` when absent. `160000` is a submodule. */
    originalMode: string;
    /** Octal mode after the change, `000000` when absent. `160000` is a submodule. */
    mode: string;
};

/** Wraps `git diff --raw -z --find-renames <from> <to> --`, without reading blob contents. */
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
        ["diff", "--raw", "-z", "--find-renames", from, to, "--"],
        10 * 1024 * 1024,
    );
    if (isErr(result)) return result;
    const output = unwrap(result).toString("utf-8");
    if (output && !output.endsWith("\0")) return err(createError(ERROR_GENERIC, "Unterminated diff changes"));
    const fields = output.split("\0");
    const entries: Change[] = [];
    for (let index = 0; index < fields.length - 1;) {
        const header = /^:([0-7]{6}) ([0-7]{6}) [0-9a-f]+ [0-9a-f]+ ([ADMTU]|[RC]\d+)$/u.exec(fields[index++] ?? "");
        const first = fields[index++];
        const [, rawOriginalMode, rawMode, code] = header ?? [];
        const status = code?.[0];
        if (!first || !rawOriginalMode || !rawMode || !code) {
            return err(createError(ERROR_GENERIC, "Malformed NUL-delimited diff changes"));
        }
        const originalMode = detach(rawOriginalMode);
        const mode = detach(rawMode);
        if (status === "R" || status === "C") {
            const renamed = fields[index++];
            if (!renamed) return err(createError(ERROR_GENERIC, "Missing renamed diff path"));
            entries.push({ status, originalPath: detach(first), path: detach(renamed), originalMode, mode });
        } else if (status === "A" || status === "D" || status === "M" || status === "T" || status === "U") {
            entries.push({ status, path: detach(first), originalMode, mode });
        } else {
            return err(createError(ERROR_GENERIC, `Unsupported diff status ${code}`));
        }
    }
    return ok(entries);
}
