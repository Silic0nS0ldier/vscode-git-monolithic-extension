import { Writable } from "stream";

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
                        toLog += Buffer.from(chunk).toString(encoding);
                    }
                    target[p].call(target, ...arguments);
                };
            }
            if (p === "destroy") {
                return function destroy() {
                    const escaped = JSON.stringify(toLog);
                    if (escaped.length > 150) {
                        log(`${escaped.slice(0, 150)}" (${escaped.length - 150} chars hidden)`);
                    }
                    else {
                        log(escaped);
                    }
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
                if (escaped.length > 150) {
                    log(`${escaped.slice(0, 150)}" (${escaped.length - 150} chars hidden)`);
                }
                log(escaped);
                cb();
            },
            write(chunk, encoding, cb) {
                if (toLog.length < 150) {
                    toLog += Buffer.from(chunk).toString(encoding);
                }
                cb();
            },
        });
    }
}
