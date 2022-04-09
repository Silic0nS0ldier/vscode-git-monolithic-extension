import test from "ava";
import getStream from "get-stream";
import stream from "node:stream";
import { toLineStream } from "./stream-by-line.js";

test("ignores empty lines", async t => {
    const source = stream.Readable.from(["foo\n", "\n", "bar\n"]);
    const ls = toLineStream(source, { encoding: "utf-8" });
    const results = await getStream.array(ls);
    t.deepEqual(results, ["foo", "bar"]);
});
