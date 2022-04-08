import cjs from "@rollup/plugin-commonjs";
import { erase } from "@silicon-soldier/erase-ts-types";
import { globby, isGitIgnoredSync } from "globby";
import * as FS from "node:fs";
import * as Path from "node:path";
import * as URL from "node:url";
import { nodeResolve } from "pnpm-node-resolve";
import { rollup } from "rollup";

async function main() {
    const buildToolsPkg = Path.dirname(URL.fileURLToPath(import.meta.url));
    const extensionPkg = Path.resolve(buildToolsPkg, "../extension/");
    const stagingAreaPkg = Path.resolve(buildToolsPkg, "../staging-area/");
    const gitPkg = Path.resolve(buildToolsPkg, "../git/");
    const repoRoot = Path.resolve(buildToolsPkg, "../..");

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
    await Promise.all([
        compile(gitPkg),
        compile(extensionPkg),
    ]);
    const copyPending = Promise.all([
        FS.promises.cp(
            Path.join(extensionPkg, "src/askpass-empty.sh"),
            Path.join(stagingAreaPkg, "src/askpass-empty.sh"),
        ),
        FS.promises.cp(Path.join(extensionPkg, "src/askpass.sh"), Path.join(stagingAreaPkg, "src/askpass.sh")),
        FS.promises.cp(Path.join(extensionPkg, "languages"), Path.join(stagingAreaPkg, "languages"), {
            recursive: true,
        }),
        FS.promises.cp(Path.join(extensionPkg, "resources"), Path.join(stagingAreaPkg, "resources"), {
            recursive: true,
        }),
        FS.promises.cp(Path.join(extensionPkg, "syntaxes"), Path.join(stagingAreaPkg, "syntaxes"), { recursive: true }),
        FS.promises.cp(Path.join(extensionPkg, "cgmanifest.json"), Path.join(stagingAreaPkg, "cgmanifest.json"), {
            recursive: true,
        }),
        FS.promises.cp(Path.join(repoRoot, "LICENSE.txt"), Path.join(stagingAreaPkg, "LICENSE.txt"), {
            recursive: true,
        }),
    ]);

    console.log("Bundling and coping artefacts...");
    await bundle([
        Path.join(extensionPkg, "dist/main.js"),
        Path.join(extensionPkg, "dist/askpass-main.js"),
    ], Path.join(stagingAreaPkg, "src"));

    console.log("Waiting for artefact copying to complete (if not already)");
    await copyPending;
}

async function cleanDist(packagePath) {
    await FS.promises.rm(Path.join(packagePath, "dist"), { recursive: true, force: true });
}

async function compile(pkgPath) {
    const paths = await globby(Path.join(pkgPath, "src/**/*.ts"));
    const work = [];
    for (const path of paths) {
        work.push((async () => {
            // Read
            const tsContent = await FS.promises.readFile(path, "utf-8");
            // Erase types
            const jsContent = erase(tsContent);
            // Work out dest
            const outPath = Path.join(pkgPath, "dist", Path.relative(Path.join(pkgPath, "src"), path)).replace(
                /\.ts$/,
                ".js",
            );
            // Prepare parent folders
            await FS.promises.mkdir(Path.join(outPath, ".."), { recursive: true });
            // Write
            await FS.promises.writeFile(outPath, jsContent, "utf-8");
        })());
    }
    await Promise.all(work);
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
