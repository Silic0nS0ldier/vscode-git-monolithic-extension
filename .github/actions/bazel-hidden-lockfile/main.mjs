import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

// GitHub's JavaScript action entry points cannot specify Node flags.
const child = spawnSync(process.execPath, [
    "--experimental-strip-types",
    fileURLToPath(new URL("./src/main.ts", import.meta.url)),
], { stdio: "inherit" });
if (child.error) {
    throw child.error;
}
process.exitCode = child.status ?? 1;
