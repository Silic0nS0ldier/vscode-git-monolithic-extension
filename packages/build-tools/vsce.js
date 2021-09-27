import * as URL from "node:url";
import * as Path from "node:path";
import Execa from "execa";

async function main() {
	const thsPkg = Path.dirname(URL.fileURLToPath(import.meta.url));
	const stgPkg = Path.resolve(thsPkg, "../staging-area/");

	Execa.sync("vsce", process.argv.slice(2), {
		preferLocal: true,
		localDir: URL.fileURLToPath(import.meta.url),
		buffer: false,
		stdio: "inherit",
		cwd: stgPkg,
	});
}

main();
