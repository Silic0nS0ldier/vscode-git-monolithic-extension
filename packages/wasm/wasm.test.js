import assert from "node:assert";
import test from "node:test";
import { from_str_radix } from "./mod.js";

test("from_str_radix parses in the given radix", () => {
    assert.strictEqual(from_str_radix("12", 8), 10);
    assert.strictEqual(from_str_radix("ff", 16), 255);
});

test("from_str_radix surfaces parse errors as exceptions", () => {
    // `Result<_, String>` is thrown as a bare string, not an `Error`.
    assert.throws(() => from_str_radix("ff", 8), (thrown) => thrown === "invalid digit found in string");
});
