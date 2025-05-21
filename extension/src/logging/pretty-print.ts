// Format JS values by indirectly using logic in https://github.com/nodejs/node/blob/863d13c192a8d315fa274194e64c1c9e5820e8f2/lib/internal/util/inspect.js
// through `new console.Console`

import { inspect } from "node:util";

export function prettyPrint(value: unknown): string {
    return inspect(value);
}
