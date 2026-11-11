import { inspect } from "node:util";

export class UnreachableError extends Error {
    constructor(value: never) {
        super(`Unexpected value: ${inspect(value)}`);
    }
}
