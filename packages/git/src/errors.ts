import { isErr, type Result, unwrap } from "./func-result.js";

export type ErrorShape<TSymbol> = {
    readonly cause?: unknown;
    readonly type: TSymbol;
    /** Throwable representation of this error. */
    readonly _error: Error;
};

export const ERROR_GIT_NOT_FOUND = Symbol("GIT_NOT_FOUND");
export type GitNotFoundError = ErrorShape<typeof ERROR_GIT_NOT_FOUND>;

export const ERROR_GIT_UNUSABLE = Symbol("GIT_UNUSABLE");
export type GitUnusableError = ErrorShape<typeof ERROR_GIT_UNUSABLE>;

export const ERROR_TIMEOUT = Symbol("ERROR_TIMEOUT");
export type TimeoutError = ErrorShape<typeof ERROR_TIMEOUT>;

export const ERROR_CANCELLED = Symbol("ERROR_CANCELLED");
export type CancelledError = ErrorShape<typeof ERROR_CANCELLED>;

export const ERROR_NON_ZERO_EXIT = Symbol("ERROR_NON_ZERO_EXIT");

/** Output is captured as a tail: git prints its fatal message last. */
export type NonZeroExitDetails = {
    readonly args: readonly string[];
    readonly cwd: string;
    readonly executablePath: string;
    readonly exitCode: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stdout: string;
    readonly stderr: string;
};

export type NonZeroExitError =
    & ErrorShape<typeof ERROR_NON_ZERO_EXIT>
    & { readonly cause: NonZeroExitDetails };

export const ERROR_GENERIC = Symbol("ERROR_GENERIC");
export type GenericError = ErrorShape<typeof ERROR_GENERIC>;

export const ERROR_BUFFER_OVERFLOW = Symbol("ERROR_BUFFER_OVERFLOW");
export type BufferOverflowError = ErrorShape<typeof ERROR_BUFFER_OVERFLOW>;

export function createError<TSymbol>(type: TSymbol, cause?: unknown): ErrorShape<TSymbol> {
    let errorCause: unknown = cause;
    if (cause != null && typeof cause === "object" && "_error" in cause) {
        errorCause = cause._error;
    }
    const error = new Error(String(type), { cause: errorCause });
    return {
        cause,
        type,
        _error: error,
    };
}

export function createNonZeroExitError(details: NonZeroExitDetails): NonZeroExitError {
    const { _error } = createError(ERROR_NON_ZERO_EXIT, details);
    return { _error, cause: details, type: ERROR_NON_ZERO_EXIT };
}

export function unwrapOk<TOk, TErr>(value: Result<TOk, TErr>): TOk {
    if (isErr(value)) {
        const error = unwrap(value);
        if (error != null && typeof error === "object" && "_error" in error) {
            throw error._error;
        }
        throw error;
    }
    return unwrap(value);
}
