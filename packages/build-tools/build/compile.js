// @ts-check
import { erase } from "@silicon-soldier/erase-ts-types";
import { globby } from "globby";
import * as FS from "node:fs";
import * as Path from "node:path";
import { extensionPkg, gitPkg, repoRoot, stagingAreaPkg } from "./helpers.js";

async function compileSource(pkgPath) {
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

/**
 * @returns {{ js: Promise<void>, misc: Promise<void> }}
 */
export function compile() {
    const js = Promise.all([
        compileSource(gitPkg),
        compileSource(extensionPkg),
    ]);
    const misc = Promise.all([
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

    return { js, misc };
}
