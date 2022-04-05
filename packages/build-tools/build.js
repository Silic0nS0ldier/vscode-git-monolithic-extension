import cjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import { erase } from "@silicon-soldier/erase-ts-types";
import { globbySync, isGitIgnoredSync } from "globby";
import * as FS from "node:fs";
import * as Path from "node:path";
import * as URL from "node:url";
import { rollup } from "rollup";

async function main() {
    const buildToolsPkg = Path.dirname(URL.fileURLToPath(import.meta.url));
    const extensionPkg = Path.resolve(buildToolsPkg, "../extension/");
    const stagingAreaPkg = Path.resolve(buildToolsPkg, "../staging-area/");
    const gitPkg = Path.resolve(buildToolsPkg, "../git/");
    const repoRoot = Path.resolve(buildToolsPkg, "../..");

    console.log("Cleaning...");
    const isIgnoredExtPkg = isGitIgnoredSync({ cwd: stagingAreaPkg });
    for (const path of globbySync(Path.resolve(stagingAreaPkg, "**")).filter(isIgnoredExtPkg)) {
        FS.rmSync(path, { force: true });
    }
    cleanDist(gitPkg);
    cleanDist(extensionPkg);

    console.log("Compiling...");
    compile(gitPkg, buildToolsPkg);
    compile(extensionPkg, buildToolsPkg);

    console.log("Stripping `node:*` from imports...");
    patchNodePrefix(gitPkg);
    patchNodePrefix(extensionPkg);

    console.log("Bundling...");
    const bundle = await rollup({
        input: [
            Path.join(extensionPkg, "dist/main.js"),
            Path.join(extensionPkg, "dist/askpass-main.js"),
        ],
        plugins: [
            cjs(),
            nodeResolve({
                exportConditions: ["default", "module", "import", "node"],
                // moduleDirectories: [
                //     Path.join(extensionPkg, 'node_modules'),
                //     Path.join(repoRoot, 'node_modules'),
                // ],
                jail: repoRoot,
                preferBuiltins: true,
            }),
        ],
        external: [
            "vscode",
        ],
    });
    await bundle.write({
        format: "cjs",
        dir: Path.join(stagingAreaPkg, "src"),
    });
    await bundle.close();

    console.log("Copying artefacts...");
    FS.cpSync(Path.join(extensionPkg, "src/askpass-empty.sh"), Path.join(stagingAreaPkg, "src/askpass-empty.sh"));
    FS.cpSync(Path.join(extensionPkg, "src/askpass.sh"), Path.join(stagingAreaPkg, "src/askpass.sh"));
    FS.cpSync(Path.join(extensionPkg, "languages"), Path.join(stagingAreaPkg, "languages"), { recursive: true });
    FS.cpSync(Path.join(extensionPkg, "resources"), Path.join(stagingAreaPkg, "resources"), { recursive: true });
    FS.cpSync(Path.join(extensionPkg, "syntaxes"), Path.join(stagingAreaPkg, "syntaxes"), { recursive: true });
    FS.cpSync(Path.join(extensionPkg, "cgmanifest.json"), Path.join(stagingAreaPkg, "cgmanifest.json"), {
        recursive: true,
    });
    FS.cpSync(Path.join(repoRoot, "LICENSE.txt"), Path.join(stagingAreaPkg, "LICENSE.txt"), { recursive: true });
}

function cleanDist(packagePath) {
    FS.rmSync(Path.join(packagePath, "dist"), { recursive: true, force: true });
}

function compile(pkgPath, buildToolsPkgPath) {
    console.log(`  ${pkgPath}`);
    const paths = globbySync(Path.join(pkgPath, "src/**/*.ts"));
    for (const path of paths) {
        // Read
        const tsContent = FS.readFileSync(path, "utf-8");
        // Erase
        const jsContent = erase(tsContent);
        // Work out dest
        const outPath = Path.join(pkgPath, "dist", Path.relative(Path.join(pkgPath, "src"), path)).replace(
            /\.ts$/,
            ".js",
        );
        // Prepare parent folders
        FS.mkdirSync(Path.join(outPath, ".."), { recursive: true });
        // Write
        FS.writeFileSync(outPath, jsContent, "utf-8");
    }
}

function patchNodePrefix(packagePath) {
    const jsFiles = globbySync(Path.join(packagePath, "dist/**/*.js"));
    for (const jsFile of jsFiles) {
        let content = FS.readFileSync(jsFile, "utf-8");
        content = content.replace(/node:/g, "");
        FS.writeFileSync(jsFile, content, { encoding: "utf-8" });
    }
}

export const running = main();
