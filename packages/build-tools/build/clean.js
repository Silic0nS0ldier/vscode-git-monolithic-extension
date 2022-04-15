// @ts-check
import { globby, isGitIgnoredSync } from "globby";
import * as FS from "node:fs";
import * as Path from "node:path";
import { extensionPkg, gitPkg, stagingAreaPkg } from "../util/paths.js";

async function cleanDist(packagePath) {
    await FS.promises.rm(Path.join(packagePath, "dist"), { recursive: true, force: true });
}

export function clean() {
    return Promise.all([
        (async () => {
            const isIgnoredExtPkg = isGitIgnoredSync({ cwd: stagingAreaPkg });
            for (const path of (await globby(Path.resolve(stagingAreaPkg, "**"))).filter(isIgnoredExtPkg)) {
                FS.rmSync(path, { force: true });
            }
        })(),
        cleanDist(gitPkg),
        cleanDist(extensionPkg),
    ]);
}
