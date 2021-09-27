import * as FS from "node:fs";
import * as URL from "node:url";
import * as Path from "node:path";
import Execa from "execa";
import { globbySync, isGitIgnoredSync } from "globby";
import { rollup } from "rollup";
import cjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";

async function main() {
	const thsPkg = Path.dirname(URL.fileURLToPath(import.meta.url));
	const extPkg = Path.resolve(thsPkg, "../extension/");
	const stgPkg = Path.resolve(thsPkg, "../staging-area/");

	console.log("Cleaning...");
	const isIgnoredExtPkg = isGitIgnoredSync({ cwd: stgPkg });
	for (const path of globbySync(Path.resolve(stgPkg, "**")).filter(isIgnoredExtPkg)) {
		FS.rmSync(path, { force: true });
	}
	FS.rmSync(Path.join(extPkg, "dist"), { recursive: true, force: true });

	console.log("Compiling...");
	Execa.sync("tsc", [], {
		preferLocal: true,
		localDir: URL.fileURLToPath(import.meta.url),
		buffer: false,
		stdio: "inherit",
		cwd: extPkg,
	});

	console.log("Stripping `node:*` from imports...");
	const jsFiles = globbySync(Path.join(extPkg, "dist/**/*.js"));
	for (const jsFile of jsFiles) {
		let content = FS.readFileSync(jsFile, 'utf-8');
		content = content.replace(/node:/g, '');
		FS.writeFileSync(jsFile, content, { encoding: 'utf-8' });
	}

	console.log("Bundling...");
	const bundle = await rollup({
		input: [
			Path.join(extPkg, "dist/main.js"),
			Path.join(extPkg, "dist/askpass-main.js"),
		],
		plugins: [
			cjs(),
			nodeResolve(),
		],
		external: [
			"vscode"
		],
	});
	await bundle.write({
		format: "cjs",
		dir: Path.join(stgPkg, "src"),

	});
	await bundle.close();

	console.log("Copying artefacts...");
	FS.cpSync(Path.join(extPkg, "src/askpass-empty.sh"), Path.join(stgPkg, "src/askpass-empty.sh"));
	FS.cpSync(Path.join(extPkg, "src/askpass.sh"), Path.join(stgPkg, "src/askpass.sh"));
	FS.cpSync(Path.join(extPkg, "languages"), Path.join(stgPkg, "languages"), { recursive: true });
	FS.cpSync(Path.join(extPkg, "resources"), Path.join(stgPkg, "resources"), { recursive: true });
	FS.cpSync(Path.join(extPkg, "syntaxes"), Path.join(stgPkg, "syntaxes"), { recursive: true });
	FS.cpSync(Path.join(extPkg, "cgmanifest.json"), Path.join(stgPkg, "cgmanifest.json"), { recursive: true });
}

main();
