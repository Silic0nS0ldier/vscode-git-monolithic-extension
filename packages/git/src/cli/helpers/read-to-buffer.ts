import { MaxBufferError, getStreamAsBuffer } from "get-stream";
import { PassThrough } from "node:stream";
import { type BufferOverflowError, createError, ERROR_BUFFER_OVERFLOW, ERROR_GENERIC, type GenericError } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import type { CLI } from "../context.js";

export type ReadToContext = {
    cli: CLI;
    cwd: string;
    timeout?: number;
};

export type ReadToErrors =
    | GenericError
    | BufferOverflowError;

/**
 * Helper which reads CLI output (stdout) and returns the resulting buffer.
 * Will abort if output exceeds the specified maxBuffer size.
 * @param context
 * @param args
 * @param maxBuffer
 */
export async function readToBuffer(context: ReadToContext, args: string[], maxBuffer: number): Promise<Result<Buffer, ReadToErrors>> {
    const stdout = new PassThrough();
    const abortController = new AbortController();

    // Read response
    try {
        const cliAction = context.cli({ cwd: context.cwd, signal: abortController.signal, stdout, timeout: context.timeout }, args);
        // Throws on max buffer hit
        const streamReader = getStreamAsBuffer(stdout, { maxBuffer });

        const [streamResult, cliResult] = await Promise.all([streamReader, cliAction]);

        if (isErr(cliResult)) {
            // Throwing to use same code path as buffer overflow handling
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
