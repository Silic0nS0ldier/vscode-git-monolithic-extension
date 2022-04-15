// Modernised verison of https://www.npmjs.com/package/byline/v/5.0.0
// https://github.com/jahewson/node-byline/blob/d0dfc01ecf0027dffba9bd962f62d992dd249de2/lib/byline.js
// License included for attribution

// Copyright (C) 2011-2015 John Hewson
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

import stream from "node:stream";
import timers from "node:timers";

type LineStreamOptions = stream.TransformOptions & {
    encoding: BufferEncoding;
};

export function toLineStream(readStream: stream.Readable, options: LineStreamOptions): LineStream {
    if (!readStream) {
        throw new Error("expected readStream");
    }
    if (!readStream.readable) {
        throw new Error("readStream must be readable");
    }
    var ls = new LineStream(options);
    readStream.pipe(ls);
    return ls;
}

export class LineStream extends stream.Transform {
    #lineBuffer: string[];
    #keepEmptyLines: boolean;
    #lastChunkEndedWithCR: boolean;

    constructor(options: LineStreamOptions) {
        super({
            ...options,
            // use objectMode to stop the output from being buffered
            // which re-concatanates the lines, just without newlines.
            objectMode: true,
        });

        this.#lineBuffer = [];
        this.#lastChunkEndedWithCR = false;
    }

    override _transform(chunk: any, encoding: BufferEncoding, done: stream.TransformCallback): void {
        let str: string;
        if (Buffer.isBuffer(chunk)) {
            str = chunk.toString(encoding);
        } else if (typeof chunk === "string") {
            str = chunk;
        } else {
            throw new Error(`Unsupported chunk ${typeof chunk}`);
        }

        // see: http://www.unicode.org/reports/tr18/#Line_Boundaries
        var lines = str.split(/\r\n|[\n\v\f\r\x85\u2028\u2029]/g);

        // don't split CRLF which spans chunks
        if (this.#lastChunkEndedWithCR && str[0] == "\n") {
            lines.shift();
        }

        if (this.#lineBuffer.length > 0) {
            this.#lineBuffer[this.#lineBuffer.length - 1] += lines[0];
            lines.shift();
        }

        this.#lastChunkEndedWithCR = str[str.length - 1] == "\r";
        this.#lineBuffer = this.#lineBuffer.concat(lines);
        this.#pushBuffer(1, done);
    }

    #pushBuffer(keep: number, done: stream.TransformCallback) {
        // always buffer the last (possibly partial) line
        while (this.#lineBuffer.length > keep) {
            var line = this.#lineBuffer.shift();
            if (!line) {
                // Nothing to push
                break;
            }
            if (line.length > 0) {
                if (!this.push(line)) {
                    // when the high-water mark is reached, defer pushes until the next tick
                    var self = this;
                    timers.setImmediate(function() {
                        self.#pushBuffer(keep, done);
                    });
                    return;
                }
            }
        }
        done();
    }

    override _flush(done: stream.TransformCallback): void {
        this.#pushBuffer(0, done);
    }
}
