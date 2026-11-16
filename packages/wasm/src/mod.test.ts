import assert from "node:assert";
import test from "node:test";
import { from_str_radix } from "./mod.js";

test("parses in the given radix", () => {
    assert.strictEqual(from_str_radix("12", 8), 10);
    assert.strictEqual(from_str_radix("ff", 16), 255);
});

test("surfaces parse errors as exceptions", () => {
    // `Result<_, JsValue>` with `JsValue::from_str` is thrown as a bare string, not an `Error`.
    assert.throws(() => from_str_radix("ff", 8), thrown => thrown === "invalid digit found in string");
    assert.throws(() => from_str_radix("", 10), thrown => thrown === "cannot parse integer from empty string");
    assert.throws(
        () => from_str_radix("4294967296", 10),
        thrown => thrown === "number too large to fit in target type",
    );
    assert.throws(
        () => from_str_radix("-1", 10),
        thrown => thrown === "invalid digit found in string",
    );
    assert.throws(
        () => from_str_radix("10", 37),
        thrown => thrown === "from_str_radix_int: must lie in the range `[2, 36]`",
    );
});
