// @ts-expect-error
import test from "ava";
import { parseIgnoreCheck } from "./parser.js";

// @ts-ignore
test("Basic case", t => {
    t.deepEqual(
        parseIgnoreCheck(".gitignore\0\0node_modules\0./node_modules\0"),
        ["./node_modules"],
    );
});
