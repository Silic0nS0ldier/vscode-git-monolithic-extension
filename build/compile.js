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
FS.cpSync("./src/askpass-empty.sh", "./dist/askpass-empty.sh");
FS.cpSync("./src/askpass.sh", "./dist/askpass.sh");

console.log("Removing non-public files...")
FS.rmSync("./dist/test", { recursive: true, force: true });
