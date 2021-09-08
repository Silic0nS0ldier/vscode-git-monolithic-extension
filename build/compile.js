import FS from "node:fs";
import URL from "node:url";
import Execa from "execa";

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
