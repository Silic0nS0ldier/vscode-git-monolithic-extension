import { PassThrough } from "node:stream";
import { finished } from "node:stream/promises";
import { createError, ERROR_GENERIC, type GenericError } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import type { GitContext } from "../context.js";

/** Runs git, feeding stdout to `parser` as it arrives. */
export async function streamToParser(
    git: GitContext,
    cwd: string,
    args: string[],
    parser: { update(chunk: string): void },
): Promise<Result<void, GenericError>> {
    const stdout = new PassThrough();
    stdout.on("data", (chunk: string) => {
        parser.update(chunk);
    });

    const cliAction = git.cli({ cwd, stdout }, args);

    const [cliResult] = await Promise.all([cliAction, finished(stdout)]);

    if (isErr(cliResult)) {
        return err(createError(ERROR_GENERIC, unwrap(cliResult)));
    }

    return ok(undefined);
}
