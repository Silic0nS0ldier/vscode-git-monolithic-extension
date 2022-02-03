import * as URL from "node:url";
import * as Path from "node:path";
import { execaSync } from "execa";

async function main() {
	console.log("Building everything first");
	const BUILD = await import ("./build.js");
	await BUILD.running;

	const thsPkg = Path.dirname(URL.fileURLToPath(import.meta.url));
	const gitPkg = Path.resolve(thsPkg, "../git/");

	console.log("Testing...");
	execaSync("ava", [], {
		preferLocal: true,
		localDir: gitPkg,
		buffer: false,
		stdio: "inherit",
		cwd: gitPkg,
	});
}

main();
