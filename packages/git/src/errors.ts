// TODO Add stack trace
type Error<TSymbol, TCause> = {
    readonly type: TSymbol;
    readonly cause?: TCause;
};

export const ERROR_GIT_NOT_FOUND = Symbol("GIT_NOT_FOUND");
export type GitNotFoundError<TCause = undefined> = Error<typeof ERROR_GIT_NOT_FOUND, TCause>;

export const ERROR_GIT_UNUSABLE = Symbol("GIT_UNUSABLE");
export type GitUnusableError<TCause = undefined> = Error<typeof ERROR_GIT_UNUSABLE, TCause>;

export const ERROR_TIMEOUT = Symbol("ERROR_TIMEOUT");
export type TimeoutError<TCause = undefined> = Error<typeof ERROR_TIMEOUT, TCause>;

export const ERROR_CANCELLED = Symbol("ERROR_CANCELLED");
export type CancelledError<TCause = undefined> = Error<typeof ERROR_CANCELLED, TCause>;

export const ERROR_NON_ZERO_EXIT = Symbol("ERROR_NON_ZERO_EXIT");
export type NonZeroExitError<TCause = undefined> = Error<typeof ERROR_NON_ZERO_EXIT, TCause>;

export const ERROR_GENERIC = Symbol("ERROR_GENERIC");
export type GenericError<TCause = undefined> = Error<typeof ERROR_GENERIC, TCause>;

export const ERROR_BUFFER_OVERFLOW = Symbol("ERROR_BUFFER_OVERFLOW");
export type BufferOverflowError<TCause = undefined> = Error<typeof ERROR_GENERIC, TCause>;
