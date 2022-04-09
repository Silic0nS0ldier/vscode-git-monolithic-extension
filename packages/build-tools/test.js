import * as Path from "node:path";
import * as URL from "node:url";
import { clean } from "./build/clean.js";
import { compile } from "./build/compile.js";
import { exec } from "./util/exec.js";

async function main() {
    console.log("Building everything first");
    await clean();
    const { js, misc } = compile();
    await js;
    await misc;

    const thsPkg = Path.dirname(URL.fileURLToPath(import.meta.url));
    const gitPkg = Path.resolve(thsPkg, "../git/");
    const extensionPkg = Path.resolve(thsPkg, "../extension/");

    console.log("Testing git package...");
    await exec("ava", [], gitPkg, gitPkg);

    console.log("Testing extension package...");
    await exec("ava", [], extensionPkg, extensionPkg);
}

main();
