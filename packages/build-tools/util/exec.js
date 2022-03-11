import { execaSync } from "execa";

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} localDir
 * @param {string} cwd
 */
export function exec(
    cmd,
    args,
    localDir,
    cwd,
) {
    try {
        execaSync(cmd, args, {
            buffer: false,
            cwd,
            localDir,
            stdio: "inherit",
        });
    } catch (e) {
        if (e instanceof Error && typeof e.command === "string") {
            /** @type {import("execa").ExecaSyncError} */
            const execaErr = e;
            console.error(new Error(`Command Failed: ${execaErr.command}`).stack);
            process.exit(1);
        }
        throw e;
    }
}
