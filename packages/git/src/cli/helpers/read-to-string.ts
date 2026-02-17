import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";
import {
    readToBuffer, type ReadToContext, type ReadToErrors
} from "./read-to-buffer.js";

// Aliases for easier usage.
export type { ReadToContext, ReadToErrors };

/**
 * Helper which reads CLI output (stdout) and returns the resulting string.
 * Will abort if output exceeds 1024KB.
 * @param context
 * @param args
 */
export async function readToString(context: ReadToContext, args: string[]): Promise<Result<string, ReadToErrors>> {
    const result = await readToBuffer(context, args, 1024);

    if (isErr(result)) {
        return err(unwrap(result));
    }

    // Buffer size is capped at 1024, well below the max string length
    // Conversion to string won't throw.
    return ok(unwrap(result).toString("utf-8"));
}
