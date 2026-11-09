import test from "ava";
import { orderedTimestamp, parseFileCursor } from "./paging.js";

test("Timeline timestamps preserve Git traversal order across page boundaries", t => {
    t.is(orderedTimestamp(100), 100);
    t.is(orderedTimestamp(90, 100), 90);
    t.is(orderedTimestamp(100, 100), 99);
    t.is(orderedTimestamp(120, 99), 98);
    t.is(orderedTimestamp(50, 98), 50);
    t.throws(() => orderedTimestamp(Number.NaN));
    t.throws(() => orderedTimestamp(0, Number.POSITIVE_INFINITY));
    t.throws(() => orderedTimestamp(-8_640_000_000_000_000, -8_640_000_000_000_000));
});

test("File Timeline cursors retain their tip, path, offset and ordering timestamp", t => {
    const cursor = { hash: "a".repeat(40), path: "old\nfile", skip: 50, before: 99 };
    t.deepEqual(parseFileCursor(JSON.stringify(cursor)), cursor);
    t.deepEqual(parseFileCursor(JSON.stringify({ path: "file", skip: 1, before: 0 })), {
        hash: undefined,
        path: "file",
        skip: 1,
        before: 0,
    });
    t.throws(() => parseFileCursor("{\"hash\":\"--all\",\"path\":\"file\",\"skip\":1,\"before\":0}"));
    for (const skip of [-1, 1.5, "1", null]) {
        t.throws(() => parseFileCursor(JSON.stringify({ path: "file", skip, before: 0 })));
    }
    for (const before of [null, 1.5, "1", 8_640_000_000_000_001]) {
        t.throws(() => parseFileCursor(JSON.stringify({ path: "file", skip: 1, before })));
    }
    t.throws(() => parseFileCursor("{\"path\":\"file\"}"));
});
