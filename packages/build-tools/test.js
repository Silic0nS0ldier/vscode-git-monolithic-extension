// @ts-check
import { clean } from "./build/clean.js";
import { compile } from "./build/compile.js";
import { exec } from "./util/exec.js";
import { extensionPkg, gitPkg } from "./util/paths.js";

async function main() {
    console.log("Building everything first");
    await clean();
    const { js, misc } = compile();
    await js;
    await misc;

    console.log("Testing git package...");
    await exec("ava", [], gitPkg, gitPkg);

    console.log("Testing extension package...");
    await exec("ava", [], extensionPkg, extensionPkg);
}

main();
