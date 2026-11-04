// Checks that every log call in the shipped bundle still passes its call site (see `callsite-plugin.ts`). Rollup drops
// arguments for parameters it can tell are never read, so this fails if `tracing.ts` stops reading `callsite`.
import { parse } from "acorn";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const LEVEL_COUNT = 5;
const CALLSITE_PREFIX = "__git_monolithic_callsite";

const bundlePath = process.argv[2];
assert.ok(bundlePath, "Expected the shipped main bundle path as an argument.");

const program = parse(readFileSync(bundlePath, "utf8"), { ecmaVersion: "latest", sourceType: "module" });

// The level functions of `tracing.ts`, found by their `(msg, callsite)` signature. Rollup may rename them.
const loggers = new Set(
    program.body
        .filter(node =>
            node.type === "FunctionDeclaration" && node.params.length === 2
            && node.params[1].type === "Identifier" && node.params[1].name === "callsite"
        )
        .map(node => node.id.name),
);
assert.equal(
    loggers.size,
    LEVEL_COUNT,
    `Expected ${LEVEL_COUNT} top-level '(msg, callsite)' log functions, found: ${[...loggers].join(", ")}`,
);

const callsites = new Map();
for (const node of program.body) {
    if (node.type !== "VariableDeclaration" || node.kind !== "const") continue;
    for (const { id, init } of node.declarations) {
        if (id.type === "Identifier" && id.name.startsWith(CALLSITE_PREFIX)) callsites.set(id.name, init);
    }
}

/** @param {import("acorn").Node} node */
function* calls(node) {
    if (node.type === "CallExpression" && node.callee.type === "Identifier" && loggers.has(node.callee.name)) {
        yield node;
    }
    for (const value of Object.values(node)) {
        for (const child of Array.isArray(value) ? value : [value]) {
            if (child !== null && typeof child === "object" && typeof child.type === "string") yield* calls(child);
        }
    }
}

let count = 0;
for (const call of calls(program)) {
    count++;
    const where = `${call.callee.name}(...) at offset ${call.start}`;
    assert.equal(call.arguments.length, 2, `${where} has no call site`);
    const argument = call.arguments[1];
    assert.ok(argument.type === "Identifier" && callsites.has(argument.name), `${where} has no call site`);
    const properties = callsites.get(argument.name).properties.map(property => property.key.name);
    assert.deepEqual(properties, ["file", "line", "column"], `${where} has a malformed call site`);
}
assert.ok(count > 0, "Found no log calls in the bundle.");
assert.equal(callsites.size, count, "Some call sites are declared but not passed to a log function.");
