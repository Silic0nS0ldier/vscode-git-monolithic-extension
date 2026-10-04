import test from "ava";
import intoStream from "into-stream";
import { tailOf } from "./tail-of-stream.js";

test("Basic case", async t => {
    const source = intoStream(["foobar", "barfoo"]);
    const tail = tailOf(source, 6);
    await tail.ended;
    t.is(tail.text(), "barfoo");
});
