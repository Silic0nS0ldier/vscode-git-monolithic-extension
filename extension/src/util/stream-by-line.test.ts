import test from "ava";
import { getStreamAsArray } from "get-stream";
import stream from "node:stream";
import { toLineStream } from "./stream-by-line.js";

test("ignores empty lines", async t => {
    const source = stream.Readable.from(["foo\n", "\n", "bar\n"]);
    const ls = toLineStream(source, { encoding: "utf-8" });
    const results = await getStreamAsArray<string>(ls);
    t.deepEqual(results, ["foo", "bar"]);
});

test("correctly handles CRLF being split across chunks, ignores empty lines", async t => {
    const source = stream.Readable.from(["foo\r", "\n\r\n", "bar\r", "\n"]);
    const ls = toLineStream(source, { encoding: "utf-8" });
    const results = await getStreamAsArray<string>(ls);
    t.deepEqual(results, ["foo", "bar"]);
});
