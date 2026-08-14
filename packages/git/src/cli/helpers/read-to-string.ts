import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import { readToBuffer, type ReadToContext, type ReadToErrors } from "./read-to-buffer.js";

// Aliases for easier usage.
export type { ReadToContext, ReadToErrors };

/** 1024KB, well below the maximum string length, so the conversion cannot throw. */
const MAX_BUFFER = 1024 * 1024;

/**
 * Helper which reads CLI output (stdout) and returns the resulting string.
 * Will abort if output exceeds 1024KB.
 * @param context
 * @param args
 */
export async function readToString(context: ReadToContext, args: string[]): Promise<Result<string, ReadToErrors>> {
    const result = await readToBuffer(context, args, MAX_BUFFER);

    if (isErr(result)) {
        return err(unwrap(result));
    }

    return ok(unwrap(result).toString("utf-8"));
}
