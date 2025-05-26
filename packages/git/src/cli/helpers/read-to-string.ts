import { MaxBufferError, getStreamAsBuffer } from "get-stream";
import { PassThrough } from "node:stream";
import { type BufferOverflowError, createError, ERROR_BUFFER_OVERFLOW, ERROR_GENERIC, type GenericError } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
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
    const abortController = new AbortController();

    // Read response
    try {
        const cliAction = context.cli({ cwd: context.cwd, signal: abortController.signal, stdout }, args);
        // Throws on max buffer hit
        const streamReader = getStreamAsBuffer(stdout, { maxBuffer: 1024 });

        const [streamResult, cliResult] = await Promise.all([streamReader, cliAction]);

        if (isErr(cliResult)) {
            // Throwing to use same code path as buffer overflow handling
            throw unwrap(cliResult);
        }

        // Buffer size is capped at 1024, well below the max string length
        // Conversion to string won't throw.
        return ok(streamResult.toString("utf-8"));
    } catch (e) {
        abortController.abort();
        if (e instanceof MaxBufferError) {
            return err(createError(ERROR_BUFFER_OVERFLOW, e));
        }
        return err(createError(ERROR_GENERIC, e));
    }
}
