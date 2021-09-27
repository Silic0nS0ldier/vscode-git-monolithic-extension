import FS from "node:fs";
import URL from "node:url";
import Execa from "execa";
import { globbySync } from "globby";

console.log("Cleaning...");
FS.rmSync("./dist", { recursive: true, force: true });

console.log("Compiling...");
Execa.sync("tsc", [], {
	preferLocal: true,
	localDir: URL.fileURLToPath(import.meta.url),
	buffer: false,
	stdio: "inherit",
});

console.log("Copying remaining artefacts...");
FS.cpSync("./src/askpass-empty.sh", "./dist/askpass-empty.sh");
FS.cpSync("./src/askpass.sh", "./dist/askpass.sh");

console.log("Stripping `node:*` from imports...");
const jsFiles = globbySync('./dist/**/*.js');
for (const jsFile of jsFiles) {
	let content = FS.readFileSync(jsFile, 'utf-8');
	content = content.replace(/node:/g, '');
	FS.writeFileSync(jsFile, content, { encoding: 'utf-8' });
}
