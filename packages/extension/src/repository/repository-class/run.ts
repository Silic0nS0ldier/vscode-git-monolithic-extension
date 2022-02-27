import { Operation } from "../Operations.js";

export type RunFn<T> = (
    operation: Operation,
    runOperation?: () => Promise<T>,
) => Promise<T>;
