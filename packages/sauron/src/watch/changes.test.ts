import test from "ava";
import { p } from "../backend/fake.stub.js";
import { createChangeBuffer } from "./changes.js";

test("repeated changes to a path are reported once", t => {
    const buffer = createChangeBuffer(10);
    buffer.addPath(p("/r/a"));
    buffer.addPath(p("/r/a"));
    t.deepEqual(buffer.take(), { paths: new Set([p("/r/a")]), subtrees: new Set() });
});

test("a directory reaching the collapse threshold replaces its entries", t => {
    const buffer = createChangeBuffer(3);
    buffer.addPath(p("/r/x"));
    buffer.addPath(p("/r/d/1"));
    buffer.addPath(p("/r/d/2"));
    buffer.addPath(p("/r/d/3"));
    buffer.addPath(p("/r/d/4"));
    t.deepEqual(buffer.take(), { paths: new Set([p("/r/x")]), subtrees: new Set([p("/r/d")]) });
});

test("a subtree absorbs paths and subtrees beneath it", t => {
    const buffer = createChangeBuffer(10);
    buffer.addPath(p("/r/a/b/c"));
    buffer.addSubtree(p("/r/a/b"));
    buffer.addSubtree(p("/r/a"));
    buffer.addPath(p("/r/a/z"));
    t.deepEqual(buffer.take(), { paths: new Set(), subtrees: new Set([p("/r/a")]) });
});

test("take resets the buffer", t => {
    const buffer = createChangeBuffer(10);
    buffer.addPath(p("/r/a"));
    buffer.take();
    t.is(buffer.size, 0);
});
