import test from "ava";
import { prettyPrint } from "./pretty-print.js";

test("litmus", t => {
    t.is(prettyPrint("string"), "'string'");
    t.is(prettyPrint(undefined), "undefined");
    t.is(prettyPrint(Promise), "[Function: Promise]");
    t.is(prettyPrint(new Promise(r => r(0))), "Promise { 0 }");
    t.true((prettyPrint(new Error("pretty-printing"))).startsWith("Error: pretty-printing\n    at"));
    t.is(prettyPrint("[object Promise]"), "'[object Promise]'");
});
