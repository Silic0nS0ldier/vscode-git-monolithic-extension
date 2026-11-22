import * as cp from "node:child_process";
import { diagnosticActivity, diagnosticGitCommand } from "../../diagnostics/activity.js";
import { trace } from "../../tracing.js";
import { sanitizePath } from "../helpers.js";
import type { SpawnOptions } from "../SpawnOptions.js";
import { cliEnv } from "./cli-env.js";

let runCounter = 0;

export function internalSpawn(
    gitPath: string,
    env: { [key: string]: string },
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
        // TODO `command` argument here is sometimes/always a git subcommand.
        ...cliEnv(env, args[0] ?? "", options.env),
    };

    if (options.cwd) {
        options.cwd = sanitizePath(options.cwd);
    }

    const cmd = `git ${args.join(" ")}`;
    const activity = diagnosticActivity.beginGitInvocation(
        typeof options.cwd === "string" ? options.cwd : undefined,
        `CMD_SPAWN_${runCounter++}`,
        diagnosticGitCommand(args),
    );
    try {
        const child = cp.spawn(gitPath, args, options);
        if (child.pid !== undefined) {
            activity.setPid(child.pid);
        } else {
            child.once("spawn", () => {
                if (child.pid !== undefined) activity.setPid(child.pid);
            });
        }
        child.once("error", () => activity.finish("failed"));
        child.once("exit", (code, signal) => activity.finish(code === 0 && signal === null ? "succeeded" : "failed"));
        return child;
    } catch (e) {
        activity.finish("failed");
        trace(`LAUNCH_FAILED > ${cmd}`);
        throw e;
    }
}
