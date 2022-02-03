import { execaSync } from "execa";
import * as Path from "node:path";
import * as URL from "node:url";

async function main() {
    console.log("Building extension first");
    const build = await import("./build.js");
    await build.running;

    console.log("Running VSCE...");

    const thsPkg = Path.dirname(URL.fileURLToPath(import.meta.url));
    const stgPkg = Path.resolve(thsPkg, "../staging-area/");

    execaSync("vsce", process.argv.slice(2), {
        preferLocal: true,
        localDir: URL.fileURLToPath(import.meta.url),
        buffer: false,
        stdio: "inherit",
        cwd: stgPkg,
    });
}

main();
