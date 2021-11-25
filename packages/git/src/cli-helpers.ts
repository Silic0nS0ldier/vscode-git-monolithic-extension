import { CLI, CLIErrors } from "./context.js";
import { ERROR_GENERIC, GenericError } from "./errors.js";
import { err, isErr, ok, Result, unwrap } from "./func-result.js";
import getStream from "get-stream";
import { PassThrough } from "stream";

export type ReadToContext = {
	cli: CLI,
	cwd: string,
};

export type ReadToErrors =
	| GenericError<CLIErrors|unknown>;

/**
 * Helper which reads CLI output (stdout) and returns the resulting string.
 * Has guards to prevent excessive RAM usage.
 * @todo Limit buffering, end spawned process if too much data
 * @param context
 * @param args
 */
export async function readToString(context: ReadToContext, args: string[]): Promise<Result<string, ReadToErrors>> {
	// Run
	// TODO Stream limit?
	const stdout = new PassThrough();
	const result = await context.cli({ cwd: context.cwd, stdout }, args);
	if (isErr(result)) {
		return err({ type: ERROR_GENERIC, cause: unwrap(result) });
	}

	// Read response
	try {
		return ok(await getStream(stdout, { encoding: 'utf-8', maxBuffer: 1024 }));
	}
	catch (e) {
		return err({ type: ERROR_GENERIC, cause: e });
	}
}