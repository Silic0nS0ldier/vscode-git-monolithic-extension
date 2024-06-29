import { Writable, Transform } from "stream";

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

    const snooper = new Transform({
        transform(chunk, encoding, callback) {
            if (toLog.length < 150) {
                toLog += stringifyChunk(chunk, encoding);
            }
            callback(null, chunk);
        },
        destroy(_error, callback) {
            const escaped = JSON.stringify(toLog);
            log(clampLength(escaped));
            callback();
        },
    });

    snooper.pipe(stream);

    return snooper;
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
