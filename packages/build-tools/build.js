// @ts-check
import cjs from "@rollup/plugin-commonjs";
import * as Path from "node:path";
import { nodeResolve } from "pnpm-node-resolve";
import { rollup } from "rollup";
import { clean } from "./build/clean.js";
import { compile } from "./build/compile.js";
import { extensionPkg, stagingAreaPkg } from "./util/paths.js";

async function main() {
    console.log("Cleaning...");
    await clean();

    console.log("Compiling and staring copying of artefacts...");
    const { js, misc } = compile();
    await js;

    console.log("Bundling and coping artefacts...");
    await bundle([
        Path.join(extensionPkg, "dist/main.js"),
        Path.join(extensionPkg, "dist/askpass-main.js"),
    ], Path.join(stagingAreaPkg, "src"));

    console.log("Waiting for artefact copying to complete (if not already)");
    await misc;
}

// TODO Replace with swc_bundler
async function bundle(entrypoints, outputDir) {
    try {
        const bundle = await rollup({
            input: entrypoints,
            plugins: [
                cjs(),
                nodeResolve({}),
            ],
            external: [
                "vscode",
            ],
        });
        await bundle.write({
            format: "cjs",
            dir: outputDir,
        });
        await bundle.close();
    } catch (e) {
        throw new Error("Bundling failed", { cause: e });
    }
}

export const running = main();
