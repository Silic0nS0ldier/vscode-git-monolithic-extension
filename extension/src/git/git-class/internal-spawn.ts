import * as cp from "node:child_process";
import { sanitizePath } from "../helpers.js";
import type { SpawnOptions } from "../SpawnOptions.js";

export function internalSpawn(
    gitPath: string,
    env: { [key: string]: string },
    log: (msg: string) => void,
    args: string[],
    options: SpawnOptions = {},
): cp.ChildProcess {
    if (!gitPath) {
        throw new Error("git could not be found in the system.");
    }

    if (!options.stdio && !options.input) {
        options.stdio = ["ignore", null, null]; // Unless provided, ignore stdin and leave default streams for stdout and stderr
    }

    options.env = {
        ...process.env,
        ...env,
        ...options.env,
        GIT_PAGER: "cat",
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        VSCODE_GIT_COMMAND: args[0],
    };

    if (options.cwd) {
        options.cwd = sanitizePath(options.cwd);
    }

    const cmd = `git ${args.join(" ")}`;
    try {
        return cp.spawn(gitPath, args, options);
    } catch (e) {
        log(`LAUNCH_FAILED > ${cmd}`);
        throw e;
    }
}
