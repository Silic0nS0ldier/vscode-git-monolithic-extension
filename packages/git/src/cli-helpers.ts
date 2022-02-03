import { CLI, CLIErrors } from "./context.js";
import { ERROR_GENERIC, GenericError } from "./errors.js";
import { err, ok, Result } from "./func-result.js";
import getStream from "get-stream";
import { PassThrough } from "stream";
import NAC from "node-abort-controller";

export type ReadToContext = {
	cli: CLI,
	cwd: string,
};

export type ReadToErrors =
	| GenericError<CLIErrors|unknown>;

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
		const cliAction = context.cli({ cwd: context.cwd, stdout, signal: abortController.signal }, args);
		// Throws one max buffer hit
		const streamReader = getStream(stdout, { encoding: 'utf-8', maxBuffer: 1024 });

		const [result] = await Promise.all([streamReader, cliAction]);

		return ok(result);
	}
	catch (e) {
		// TODO Provide specific error if max buffer hit
		abortController.abort();
		return err({ type: ERROR_GENERIC, cause: e });
	}
}