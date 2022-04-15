import type { OperationOptions } from "../Operations.js";

export type RunFn<T> = (
    operation: OperationOptions,
    runOperation?: () => Promise<T>,
) => Promise<T>;
