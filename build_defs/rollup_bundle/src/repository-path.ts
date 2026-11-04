import * as path from "node:path";

/**
 * Names a file by where it sits in the repository (e.g. `extension/src/main.ts`, `packages/git/src/api/commit.ts`),
 * whether it is in the Bazel output tree or not, and third-party npm packages by their package name, not their
 * location in the store.
 */
export function repositoryPath(absolutePath: string): string {
    const binDir = process.env["BAZEL_BINDIR"];
    const binIndex = binDir === undefined ? -1 : absolutePath.lastIndexOf(`/${binDir}/`);
    const relative = binIndex === -1
        ? path.relative(process.cwd(), absolutePath)
        : absolutePath.slice(binIndex + binDir!.length + 2);
    return relative
        .replace(/(^|\/)node_modules\/\.aspect_rules_js\/[^/]+\/node_modules\//g, "$1node_modules/")
        .replace(/^node_modules\/monolithic-git-interop\//, "packages/git/")
        .replace(/^node_modules\/monolithic-git-wasm\//, "packages/wasm/");
}
