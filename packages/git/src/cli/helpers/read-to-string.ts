import getStream, { MaxBufferError } from "get-stream";
import NAC from "node-abort-controller";
import { PassThrough } from "stream";
import { BufferOverflowError, createError, ERROR_BUFFER_OVERFLOW, ERROR_GENERIC, GenericError } from "../../errors.js";
import { err, isErr, ok, Result, unwrap } from "../../func-result.js";
import type { CLI } from "../context.js";

export type ReadToContext = {
    cli: CLI;
    cwd: string;
};

export type ReadToErrors =
    | GenericError
    | BufferOverflowError;

/**
 * Helper which reads CLI output (stdout) and returns the resulting string.
 * Will abort if output exceeds 1024KB.
 * @param context
 * @param args
 */
export async function readToString(context: ReadToContext, args: string[]): Promise<Result<string, ReadToErrors>> {
    const stdout = new PassThrough();
    const abortController = new NAC.AbortController();

    // Read response
    try {
        const cliAction = context.cli({ cwd: context.cwd, signal: abortController.signal, stdout }, args);
        // Throws on max buffer hit
        const streamReader = getStream(stdout, { encoding: "utf-8", maxBuffer: 1024 });

        const [streamResult, cliResult] = await Promise.all([streamReader, cliAction]);

        if (isErr(cliResult)) {
            throw unwrap(cliResult);
        }

        return ok(streamResult);
    } catch (e) {
        abortController.abort();
        if (e instanceof MaxBufferError) {
            return err(createError(ERROR_BUFFER_OVERFLOW, e));
        }
        return err(createError(ERROR_GENERIC, e));
    }
}
