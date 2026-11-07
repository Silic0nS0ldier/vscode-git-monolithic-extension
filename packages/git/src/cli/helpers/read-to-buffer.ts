import { getStreamAsBuffer, MaxBufferError } from "get-stream";
import { PassThrough, Transform } from "node:stream";
import {
    type BufferOverflowError,
    createError,
    ERROR_BUFFER_OVERFLOW,
    ERROR_GENERIC,
    type GenericError,
} from "../../errors.js";
import { err, isErr, ok, type Result } from "../../func-result.js";
import type { CLI, CLIErrors } from "../context.js";

export type ReadToContext = {
    cli: CLI;
    cwd: string;
    timeout?: number;
    signal?: AbortSignal;
    input?: string | Uint8Array;
    /** Keeps the returned part of each stdout chunk; only kept output counts toward `maxBuffer`. */
    filter?: (chunk: Buffer) => Buffer | undefined;
};

export type ReadToErrors =
    | GenericError
    | BufferOverflowError
    | CLIErrors;

/**
 * Helper which reads CLI output (stdout) and returns the resulting buffer.
 * Will abort if output exceeds the specified maxBuffer size.
 * @param context
 * @param args
 * @param maxBuffer
 */
export async function readToBuffer(
    context: ReadToContext,
    args: string[],
    maxBuffer: number,
): Promise<Result<Buffer, ReadToErrors>> {
    const { filter } = context;
    const stdout = filter
        ? new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                callback(null, filter(chunk));
            },
        })
        : new PassThrough();
    const abortController = new AbortController();

    // Read response
    try {
        const cliAction = context.cli({
            cwd: context.cwd,
            signal: context.signal
                ? AbortSignal.any([context.signal, abortController.signal])
                : abortController.signal,
            stdout,
            timeout: context.timeout,
            input: context.input,
        }, args);
        // Throws on max buffer hit
        const streamReader = getStreamAsBuffer(stdout, { maxBuffer });

        const [streamResult, cliResult] = await Promise.all([streamReader, cliAction]);

        if (isErr(cliResult)) {
            return cliResult;
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
