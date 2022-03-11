import * as Path from "node:path";
import * as URL from "node:url";
import { exec } from "./util/exec.js";

async function main() {
    console.log("Building everything first");
    const BUILD = await import("./build.js");
    await BUILD.running;

    const thsPkg = Path.dirname(URL.fileURLToPath(import.meta.url));
    const gitPkg = Path.resolve(thsPkg, "../git/");

    console.log("Testing...");
    exec("ava", [], gitPkg, gitPkg);
}

main();
