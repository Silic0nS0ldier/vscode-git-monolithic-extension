// @ts-check
import cjs from "@rollup/plugin-commonjs";
import { globby, isGitIgnoredSync } from "globby";
import * as FS from "node:fs";
import * as Path from "node:path";
import { nodeResolve } from "pnpm-node-resolve";
import { rollup } from "rollup";
import { compile } from "./build/compile.js";
import { extensionPkg, gitPkg, stagingAreaPkg } from "./build/helpers.js";

async function main() {
    console.log("Cleaning...");
    await Promise.all([
        (async () => {
            const isIgnoredExtPkg = isGitIgnoredSync({ cwd: stagingAreaPkg });
            for (const path of (await globby(Path.resolve(stagingAreaPkg, "**"))).filter(isIgnoredExtPkg)) {
                FS.rmSync(path, { force: true });
            }
        })(),
        cleanDist(gitPkg),
        cleanDist(extensionPkg),
    ]);

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

async function cleanDist(packagePath) {
    await FS.promises.rm(Path.join(packagePath, "dist"), { recursive: true, force: true });
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
