// Format JS values by indirectly using logic in https://github.com/nodejs/node/blob/863d13c192a8d315fa274194e64c1c9e5820e8f2/lib/internal/util/inspect.js
// through `new console.Console`

import { getStreamAsBuffer } from "get-stream";
import { PassThrough } from "node:stream";

export async function prettyPrint(value: unknown): Promise<string> {
    const stdout = new PassThrough();
    const formattingConsole = new console.Console(stdout);

    try {
        const pending = getStreamAsBuffer(stdout, { maxBuffer: 1024 });
        formattingConsole.log(value);
        stdout.end();
        return (await pending).toString("utf-8");
    } catch (e) {
        // Settle for second best
        return JSON.stringify(value, null, 2);
    }
}
