import { execa } from "execa";

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} localDir
 * @param {string} cwd
 */
export async function exec(
    cmd,
    args,
    localDir,
    cwd,
) {
    try {
        await execa(cmd, args, {
            buffer: false,
            cwd,
            localDir,
            preferLocal: true,
            stdio: "inherit",
            env: {
                NODE_OPTIONS: "--experimental-import-meta-resolve",
            },
        });
    } catch (e) {
        if (e instanceof Error && typeof e.command === "string") {
            /** @type {import("execa").ExecaSyncError} */
            const execaErr = e;
            console.error(new Error(`Command Failed: ${execaErr.command}`, { cause: execaErr }));
            process.exit(1);
        }
        throw e;
    }
}
