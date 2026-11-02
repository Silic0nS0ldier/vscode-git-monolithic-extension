import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bundlePath = process.argv[2];
assert.ok(bundlePath, "Expected the shipped main bundle path as an argument.");

const bundle = readFileSync(bundlePath, "utf8");
assert.ok(
    !bundle.includes("is not in this build: the integration test suite did not declare it"),
    "The shipped bundle contains the pruned-command failure message.",
);
