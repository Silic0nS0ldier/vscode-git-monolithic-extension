import { spawn } from "child_process";
import * as FS from "fs";
import which from "which";
import type NAC from "node-abort-controller";
import { readToString } from "./cli-helpers.js";
import { CancelledError, ERROR_CANCELLED, ERROR_GENERIC, ERROR_GIT_NOT_FOUND, ERROR_NON_ZERO_EXIT, ERROR_TIMEOUT, GenericError, GitNotFoundError, NonZeroExitError, TimeoutError } from "./errors.js";
import { err, isErr, ok, Result, unwrap } from "./func-result.js";

export type CLIContext = {
	/** @todo Replace with web stream once VSCode at NodeJS 16 */
	readonly stdout?: NodeJS.WritableStream,
	/** @todo Replace with web stream once VSCode at NodeJS 16 */
	readonly stderr?: NodeJS.WritableStream,
	readonly env?: { readonly [x: string]: string|undefined },
	readonly cwd: string,
	readonly timeout?: number,
	/** @todo Use native types once VSCode at NodeJS 15. */
	readonly signal?: NAC.AbortSignal,
};

export type CLIErrors =
	| GitNotFoundError
	| TimeoutError
	| CancelledError
	| NonZeroExitError
	| GenericError<Error>;
export type CLI = (context: CLIContext, args: string[]) => Promise<Result<void, CLIErrors>>;

/**
 * Context for all git commands.
 * Provides a function which calls-out to git and information to guide interactions.
 */
export type GitContext = {
	/** Function which calls-out to git executable. */
	readonly cli: CLI,
	/**
	 * The git version, normally read from git during context creation.
	 * Parts of the API surface may use this to modify the interaction with git.
	 */
	readonly version: string,
};

export type ContextCreationErrors =
	| GitNotFoundError
	| TimeoutError;

// TODO Investigate if and how to monitor stdio globally (without causing memory issues)
export type PersistentCLIContext = {
	readonly env: { readonly [x: string]: string|undefined },
	readonly timeout: number,
};

type Environment = {
	path: string,
	pathExt: string,
}

/**
 * Creates git context from environment (e.g. `PATH`).
 */
export async function fromEnvironment(env: Environment, cliContext: PersistentCLIContext): Promise<Result<GitContext, ContextCreationErrors>> {
	try {
		// TODO Fix types in DT so we can use nothrow
		const gitPath = await which('git', { path: env.path, pathExt: env.pathExt });
		return await fromPath(gitPath, cliContext);
	}
	catch {
		return err({ type: ERROR_GIT_NOT_FOUND });
	}
}

/**
 * Creates git context from path.
 * @param gitPath Absolute path to git executable.
 */
export async function fromPath(gitPath: string, cliContext: PersistentCLIContext): Promise<Result<GitContext, ContextCreationErrors>> {
	if (FS.existsSync(gitPath)) {
		const cli = createCLI(gitPath, cliContext);
		const versionResult = await readToString({ cli, cwd: process.cwd() }, ['--version']);

		if (isErr(versionResult)) {
			// TODO Make more specific
			return err({ type: ERROR_GIT_NOT_FOUND });
		}

		return ok({
			cli,
			version: unwrap(versionResult).replace(/^git version /, ''),
		});
	}

	return err({ type: ERROR_GIT_NOT_FOUND });
}

type CLIResult = Result<
	{ code: number|null, signal: NodeJS.Signals|null },
	TimeoutError|GenericError<Error>|CancelledError
>;

/**
 * Creates a wrapper around the git CLI.
 * @todo Confirm child process errors are handled
 * @param executablePath Path to git executable.
 * @param persistentContext Persistent context for CLI. Provides a mechanism for bound control and monitoring.
 */
function createCLI(executablePath: string, persistentContext: PersistentCLIContext): CLI {
	return async function cli(context, args) {
		// Compose environment variables
		const env = {
			// TODO Remove this, it makes testing impossible
			...process.env,
			...persistentContext.env,
			...context.env ?? {},
		};
		const cwd = context.cwd;

		const cp = spawn(executablePath, args, { env, cwd, stdio: 'pipe' });

		if (context.stdout) {
			cp.stdout.pipe(context.stdout);
		}
		if (context.stderr) {
			cp.stderr.pipe(context.stderr);
		}

		const onTimeout = new Promise<CLIResult>(resolve =>
			void setTimeout(
				() => resolve(err({ type: ERROR_TIMEOUT })),
				context.timeout ?? persistentContext.timeout,
			),
		);
		const onAbort = new Promise<CLIResult>(resolve =>
			void context.signal?.onabort?.(() => void resolve(err({ type: ERROR_CANCELLED }))),
		);
		const onError = new Promise<CLIResult>(resolve =>
			void cp.once('error', (error) => resolve(err({ type: ERROR_GENERIC, cause: error }))),
		);
		const onExit = new Promise<CLIResult>(resolve =>
			void cp.once('exit', (code, signal) => resolve(ok({ code, signal }))),
		);

		const result = await Promise.race([onTimeout, onError, onExit, onAbort]);

		if (isErr(result)) {
			// End process
			if (cp.connected) {
				// TODO monitor for errors killing
				cp.kill();
			}
			// TODO Refine generic error into something more specific
			return result;
		}

		const okResult = unwrap(result);

		if (okResult.code !== 0) {
			return err({ type: ERROR_NON_ZERO_EXIT });
		}

		return ok(undefined);
	}
}
