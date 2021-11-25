import * as FS from "node:fs";
import * as URL from "node:url";
import * as Path from "node:path";
import { execaSync } from "execa";
import { globbySync } from "globby";

async function main() {
	console.log("Building extension first");
	const BUILD = await import ("./build.js");
	await BUILD.running;

	console.log("Working on tests...");

	const thsPkg = Path.dirname(URL.fileURLToPath(import.meta.url));
	const tstPkg = Path.resolve(thsPkg, "../tests/");

	console.log("Cleaning...");
	FS.rmSync(Path.join(tstPkg, "dist"), { recursive: true, force: true });

	console.log("Compiling...");
	execaSync("tsc", [], {
		preferLocal: true,
		localDir: thsPkg,
		buffer: false,
		stdio: "inherit",
		cwd: tstPkg,
	});

	console.log("Stripping `node:*` from imports...");
	const jsFiles = globbySync(Path.join(tstPkg, "dist/**/*.js"));
	for (const jsFile of jsFiles) {
		let content = FS.readFileSync(jsFile, 'utf-8');
		content = content.replace(/node:/g, '');
		FS.writeFileSync(jsFile, content, { encoding: 'utf-8' });
	}

	console.log("Testing...");
	Execa.sync("mocha", ["dist/**.test.js"], {
		preferLocal: true,
		localDir: tstPkg,
		buffer: false,
		stdio: "inherit",
		cwd: tstPkg,
	});
}

main();
