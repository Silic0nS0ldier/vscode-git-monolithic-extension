import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { rollup } from "rollup";
import { commandPruningPlugin } from "./command-pruning-plugin.js";
import { nodeBuiltinPrefixPlugin } from "./node-builtin-prefix-plugin.js";

async function fixture(run: (directory: string) => Promise<void>): Promise<void> {
    const directory = await mkdtemp(path.join(tmpdir(), "rollup-command-pruning-"));
    try {
        await writeFile(
            path.join(directory, "entry.js"),
            `
            import { createCommand as kept } from "./kept.js";
            import { createCommand as omitted, shared } from "./omitted.js";
            export const result = [kept().method(), omitted(), shared()];
        `,
        );
        await writeFile(
            path.join(directory, "kept.js"),
            `
            function makeCommandId(name) { return "ext." + name; }
            export function createCommand() {
                return { commandId: makeCommandId("kept"), method: () => "kept implementation" };
            }
        `,
        );
        await writeFile(
            path.join(directory, "omitted.js"),
            `
            function makeCommandId(name) { return "ext." + name; }
            export function shared() { return "shared export"; }
            export function createCommand() {
                return { commandId: makeCommandId("omitted"), method: () => "omitted implementation" };
            }
        `,
        );
        await writeFile(
            path.join(directory, "selection.js"),
            "export const kept = true;\nexport const omitted = false;\n",
        );
        await run(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

test("Prunes only unselected factories, retaining shared exports and source maps", async () => {
    await fixture(async directory => {
        const bundle = await rollupFixture(directory);
        try {
            const { output } = await bundle.generate({ format: "esm", sourcemap: true });
            const chunk = output.find(output => output.type === "chunk");
            assert.ok(chunk);
            assert.match(chunk.code, /kept implementation/);
            assert.doesNotMatch(chunk.code, /omitted implementation/);
            assert.ok(chunk.map?.sources.some(source => source.endsWith("omitted.js")));
            const module = await import(
                `data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`
            ) as {
                result: [string, { commandId: string; method: () => void; options: Record<string, unknown> }, string];
            };
            assert.equal(module.result[0], "kept implementation");
            assert.equal(module.result[1].commandId, "ext.omitted");
            assert.deepEqual(module.result[1].options, {});
            const logPath = path.join(directory, "pruned.log");
            process.env["GIT_MONOLITHIC_ITEST_PRUNED_LOG"] = logPath;
            try {
                assert.throws(
                    module.result[1].method,
                    /'omitted' is not in this build: the integration test suite did not declare it/,
                );
            } finally {
                delete process.env["GIT_MONOLITHIC_ITEST_PRUNED_LOG"];
            }
            assert.equal(await readFile(logPath, "utf8"), "omitted\n");
            assert.equal(module.result[2], "shared export");
        } finally {
            await bundle.close();
        }
    });
});

test("Does not inject the pruned helper when every command is selected", async () => {
    await fixture(async directory => {
        await writeFile(
            path.join(directory, "selection.js"),
            "export const kept = true;\nexport const omitted = true;\n",
        );
        const bundle = await rollupFixture(directory);
        try {
            const { output } = await bundle.generate({ format: "esm" });
            const chunk = output.find(output => output.type === "chunk");
            assert.ok(chunk);
            assert.doesNotMatch(chunk.code, /is not in this build/);
            assert.doesNotMatch(chunk.code, /GIT_MONOLITHIC_ITEST_PRUNED_LOG/);
        } finally {
            await bundle.close();
        }
    });
});

test("Rejects a selection with a missing factory", async () => {
    await fixture(async directory => {
        await writeFile(
            path.join(directory, "selection.js"),
            `
            export const kept = true;
            export const omitted = false;
            export const missing = true;
        `,
        );
        await assert.rejects(rollupFixture(directory), /Command factories not found: missing/);
    });
});

test("Rejects a factory absent from the selection", async () => {
    await fixture(async directory => {
        await writeFile(path.join(directory, "selection.js"), "export const kept = true;");
        await assert.rejects(rollupFixture(directory), /Command 'omitted' is missing/);
    });
});

function rollupFixture(directory: string) {
    return rollup({
        input: path.join(directory, "entry.js"),
        plugins: [
            commandPruningPlugin(
                path.join(directory, "selection.js"),
                directory,
            ),
            nodeBuiltinPrefixPlugin(),
        ],
    });
}
