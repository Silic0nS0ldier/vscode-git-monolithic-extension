import test from "ava";
import { computeLineChanges } from "./line-changes.js";

test("reports no changes for identical documents", t => {
    t.deepEqual(computeLineChanges(["a", "b"], ["a", "b"]), { changes: [], hitTimeout: false });
});

test("reports an inserted line as following the line before it", t => {
    t.deepEqual(computeLineChanges(["a", "b"], ["a", "x", "b"]).changes, [
        { originalStartLineNumber: 1, originalEndLineNumber: 0, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 },
    ]);
});

test("reports a line inserted at the start as following line 0", t => {
    t.deepEqual(computeLineChanges(["a"], ["x", "a"]).changes, [
        { originalStartLineNumber: 0, originalEndLineNumber: 0, modifiedStartLineNumber: 1, modifiedEndLineNumber: 1 },
    ]);
});

test("reports a deleted line as preceding the next modified line", t => {
    t.deepEqual(computeLineChanges(["a", "b", "c"], ["a", "c"]).changes, [
        { originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 1, modifiedEndLineNumber: 0 },
    ]);
});

test("reports a modified line on both sides", t => {
    t.deepEqual(computeLineChanges(["const foo = 1;"], ["const bar = 2;"]).changes, [
        { originalStartLineNumber: 1, originalEndLineNumber: 1, modifiedStartLineNumber: 1, modifiedEndLineNumber: 1 },
    ]);
});

test("does not ignore leading and trailing whitespace changes", t => {
    t.deepEqual(computeLineChanges(["a", "  b", "c"], ["a", "b  ", "c"]).changes, [
        { originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 },
    ]);
});

test("reports each hunk of a multi-hunk change separately", t => {
    t.deepEqual(
        computeLineChanges(
            ["one", "two", "three", "four", "five", "six"],
            ["zero", "one", "two", "3", "four", "six", "seven"],
        ).changes,
        [
            {
                originalStartLineNumber: 0,
                originalEndLineNumber: 0,
                modifiedStartLineNumber: 1,
                modifiedEndLineNumber: 1,
            },
            {
                originalStartLineNumber: 3,
                originalEndLineNumber: 3,
                modifiedStartLineNumber: 4,
                modifiedEndLineNumber: 4,
            },
            {
                originalStartLineNumber: 5,
                originalEndLineNumber: 5,
                modifiedStartLineNumber: 5,
                modifiedEndLineNumber: 0,
            },
            {
                originalStartLineNumber: 6,
                originalEndLineNumber: 0,
                modifiedStartLineNumber: 7,
                modifiedEndLineNumber: 7,
            },
        ],
    );
});

// The legacy algorithm reported lines 5-8 here, so staging the hunk the diff editor displays
// left out its blank line.
test("places an inserted block where the diff editor displays it", t => {
    t.deepEqual(
        computeLineChanges(
            ["function a() {", "  x", "}", "", "function b() {", "  y", "}"],
            ["function a() {", "  x", "}", "", "function c() {", "  z", "}", "", "function b() {", "  y", "}"],
        ).changes,
        [
            {
                originalStartLineNumber: 3,
                originalEndLineNumber: 0,
                modifiedStartLineNumber: 4,
                modifiedEndLineNumber: 7,
            },
        ],
    );
});
