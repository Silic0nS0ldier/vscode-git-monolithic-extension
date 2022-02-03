import type NAC from "node-abort-controller";
import { CancelledError, GenericError, GitNotFoundError, NonZeroExitError, TimeoutError } from "../errors.js";
import { Result } from "../func-result.js";

export type CLIContext = {
    /** @todo Replace with web stream once VSCode at NodeJS 16 */
    readonly stdout?: NodeJS.WritableStream;
    /** @todo Replace with web stream once VSCode at NodeJS 16 */
    readonly stderr?: NodeJS.WritableStream;
    readonly env?: { readonly [x: string]: string | undefined };
    readonly cwd: string;
    readonly timeout?: number;
    /** @todo Use native types once VSCode at NodeJS 15. */
    readonly signal?: NAC.AbortSignal;
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
    readonly cli: CLI;
    /**
     * The git version, normally read from git during context creation.
     * Parts of the API surface may use this to modify the interaction with git.
     */
    readonly version: string;
};

export type ContextCreationErrors =
    | GitNotFoundError
    | TimeoutError;

// TODO Investigate if and how to monitor stdio globally (without causing memory issues)
export type PersistentCLIContext = {
    readonly env: { readonly [x: string]: string | undefined };
    readonly timeout: number;
};

export type CLIResult = Result<
    { code: number | null; signal: NodeJS.Signals | null },
    TimeoutError | GenericError<Error> | CancelledError
>;
