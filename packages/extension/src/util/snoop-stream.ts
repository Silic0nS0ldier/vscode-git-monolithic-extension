import { Writable } from "stream";

function stringifyChunk(chunk: any, encoding: BufferEncoding): string {
    try {
        return Buffer.from(chunk).toString(encoding);
    } catch {
        return String(chunk);
    }
}

function clampLength(str: string): string {
    if (str.length > 150) {
        return `${str.slice(0, 150)}" (${str.length - 150} chars hidden)`;
    } else {
        return str;
    }
}

/**
 * Wraps existing writable stream with proxy to enable monitoring with minimal overhead.
 */
export function snoopOnStream(stream: NodeJS.WritableStream, log: (msg: string) => void): NodeJS.WritableStream {
    let toLog = "";
    return new Proxy(stream, {
        get(target: any, p) {
            if (p === "write") {
                return function write(chunk: any, encoding: BufferEncoding) {
                    if (toLog.length < 150) {
                        toLog += stringifyChunk(chunk, encoding);
                    }
                    target[p].call(target, ...arguments);
                };
            }
            if (p === "destroy") {
                return function destroy() {
                    const escaped = JSON.stringify(toLog);
                    log(clampLength(escaped));
                    target[p].call(target, ...arguments);
                };
            }
            return (target as any)[p];
        },
    });
}

/**
 * A writeable stream which will log for first bit of input.
 */
export class SnoopStream extends Writable {
    constructor(log: (msg: string) => void) {
        let toLog = "";
        super({
            final(cb) {
                const escaped = JSON.stringify(toLog);
                log(clampLength(escaped));
                cb();
            },
            write(chunk, encoding, cb) {
                if (toLog.length < 150) {
                    toLog += stringifyChunk(chunk, encoding);
                }
                cb();
            },
        });
    }
}
