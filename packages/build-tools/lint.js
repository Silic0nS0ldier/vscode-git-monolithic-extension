// @ts-check
import { exec } from "./util/exec.js";
import { extensionPkg, gitPkg, repoRoot } from "./util/paths.js";

// eslint
async function eslint() {
    console.log("Linting with ESLint against git package...");
    await exec("eslint", ["--ext", "ts", "--fix", "--color", "./src/"], repoRoot, gitPkg);

    console.log("Linting with ESLint against extension package...");
    await exec("eslint", ["--ext", "ts", "--fix", "--color", "./src/"], repoRoot, extensionPkg);
}

// typescript
async function typescript() {
    console.log("Linting with TypeScript against git package...");
    await exec("tsc", [], repoRoot, gitPkg);

    console.log("Linting with TypeScript against extension package...");
    await exec("tsc", ["--noEmit"], repoRoot, extensionPkg);
}

async function main() {
    await eslint();
    await typescript();
}

main();
