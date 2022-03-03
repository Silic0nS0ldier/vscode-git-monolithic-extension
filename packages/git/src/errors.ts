type ErrorShape<TSymbol> = {
    readonly cause?: unknown;
    readonly type: TSymbol;
    readonly unstableStack: unknown;
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
export type NonZeroExitError = ErrorShape<typeof ERROR_NON_ZERO_EXIT>;

export const ERROR_GENERIC = Symbol("ERROR_GENERIC");
export type GenericError = ErrorShape<typeof ERROR_GENERIC>;

export const ERROR_BUFFER_OVERFLOW = Symbol("ERROR_BUFFER_OVERFLOW");
export type BufferOverflowError = ErrorShape<typeof ERROR_BUFFER_OVERFLOW>;

export function createError<TSymbol>(type: TSymbol, cause?: unknown): ErrorShape<TSymbol> {
    let unstableStack;
    try {
        throw new Error();
    } catch (e) {
        unstableStack = e.stack as string ?? "";
        unstableStack = unstableStack.split("\n").slice(2).join("\n");
    }
    return {
        type,
        unstableStack,
        cause,
    };
}
