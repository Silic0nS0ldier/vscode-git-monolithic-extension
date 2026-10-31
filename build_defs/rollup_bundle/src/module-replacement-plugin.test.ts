import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { rollup } from "rollup";
import { moduleReplacementPlugin } from "./module-replacement-plugin.js";

async function withTemporaryDirectory(run: (directory: string) => Promise<void>): Promise<void> {
    const directory = await mkdtemp(path.join(tmpdir(), "rollup-module-replacement-"));
    try {
        await run(directory);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

test("A replacement changes module contents without changing its ID", async () => {
    await withTemporaryDirectory(async directory => {
        const modulePath = path.join(directory, "module.js");
        const replacementPath = path.join(directory, "replacement.js");
        const configuredModulePath = path.relative(process.cwd(), modulePath);
        const replacementSource = "export const value = \"replacement\";";
        await writeFile(modulePath, "export const value = \"original\";");
        await writeFile(replacementPath, replacementSource);

        const bundle = await rollup({
            input: modulePath,
            plugins: [moduleReplacementPlugin([[configuredModulePath, replacementPath]])],
        });
        try {
            const { output } = await bundle.generate({ format: "esm" });
            const chunk = output.find(output => output.type === "chunk");
            assert.ok(chunk);
            assert.deepEqual(Object.keys(chunk.modules), [modulePath]);
            assert.match(chunk.code, /replacement/);
            assert.doesNotMatch(chunk.code, /original/);
        } finally {
            await bundle.close();
        }
    });
});

test("An unmatched replacement fails the build", async () => {
    await withTemporaryDirectory(async directory => {
        const modulePath = path.join(directory, "module.js");
        await writeFile(modulePath, "export const value = true;");

        await assert.rejects(
            rollup({
                input: modulePath,
                plugins: [moduleReplacementPlugin([[path.join(directory, "unmatched.js"), "replacement.js"]])],
            }),
            /Module replacement did not match resolved module/,
        );
    });
});
