import { type Readable, Writable } from "node:stream";

export type OutputTail = {
    /** Resolves once the source stream has been fully consumed. */
    readonly ended: Promise<void>;
    text(): string;
};

/**
 * Retains the last `limit` bytes written to `source`.
 *
 * Consuming the stream is not optional: an unread pipe stalls the child once its buffer
 * fills.
 */
export function tailOf(source: Readable, limit: number): OutputTail {
    const chunks: Buffer[] = [];
    let size = 0;

    const sink = new Writable({
        write(chunk: Buffer, _encoding, cb) {
            if (chunk.length > limit) {
                // Trim chunk to fit
                chunk = chunk.subarray(chunk.length - limit);
            }

            if (chunk.length === limit) {
                chunks.length = 0;
                chunks.push(chunk);
                size = limit;
            } else {
                // If chunks collectively over limit, drop oldest until there is room
                while (size + chunk.length > limit) {
                    // Invariant: We know `chunks` as _at least_ one item.
                    size -= (chunks[0] as Buffer).length;
                    chunks.shift();
                }
                chunks.push(chunk);
                size += chunk.length;
            }

            cb();
        },
    });
    source.pipe(sink);

    return {
        ended: new Promise<void>(resolve => void sink.once("finish", () => resolve())),
        text: () => Buffer.concat(chunks).subarray(-limit).toString("utf-8"),
    };
}
