import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { rollup } from "rollup";
import { wasmSourcePhasePlugin } from "./wasm-source-phase-plugin.js";

test("The fallback reads the emitted asset via a single relative URL", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rollup-wasm-source-phase-"));
    try {
        const entryPath = path.join(directory, "entry.js");
        await writeFile(entryPath, "import source W from \"./test.wasm\";\nconsole.log(W);");
        await writeFile(path.join(directory, "test.wasm"), new Uint8Array([0]));

        const bundle = await rollup({
            input: entryPath,
            plugins: [wasmSourcePhasePlugin()],
        });
        try {
            const { output } = await bundle.generate({ dir: path.join(directory, "dist"), format: "es" });
            const chunks = output.filter(output => output.type === "chunk");
            const code = chunks.map(chunk => chunk.code).join("\n");
            assert.match(code, /readFile\(new URL\(["']\.\/assets\/test-[^"']+\.wasm["'], import\.meta\.url\)\)/);
            assert.doesNotMatch(code, /new URL\(new URL\(/);
        } finally {
            await bundle.close();
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
