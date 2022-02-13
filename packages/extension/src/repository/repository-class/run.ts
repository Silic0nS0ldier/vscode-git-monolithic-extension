import { Operation } from "../Operation.js";

export type RunFn<T> = (
    operation: Operation,
    runOperation?: () => Promise<T>,
) => Promise<T>;
