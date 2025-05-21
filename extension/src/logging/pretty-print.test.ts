import test from "ava";
import { prettyPrint } from "./pretty-print.js";

test("litmus", async t => {
    t.is(await prettyPrint("string"), "string");
    t.is(await prettyPrint(undefined), "undefined");
    t.is(await prettyPrint(Promise), "[Function: Promise]");
    t.is(await prettyPrint(new Promise(r => r(0))), "Promise { 0 }");
    t.true((await prettyPrint(new Error("pretty-printing"))).startsWith("Error: pretty-printing\n    at"));
    // Yeah... This scenario just pain sucks for debugging...
    t.is(await prettyPrint("[object Promise]"), "[object Promise]");
});
