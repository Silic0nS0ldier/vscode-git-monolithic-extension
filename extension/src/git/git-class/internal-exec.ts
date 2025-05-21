import { DurationFormat } from "@formatjs/intl-durationformat";
import { Temporal } from "@js-temporal/polyfill";
import { isErr, unwrap } from "monolithic-git-interop/util/result";
import { getGitErrorCode, GitError } from "../error.js";
import { exec, type IExecutionResult } from "../exec.js";
import type { SpawnOptions } from "../SpawnOptions.js";
import { internalSpawn } from "./internal-spawn.js";

let runCounter = 0;

export async function internalExec(
    gitPath: string,
    env: { [key: string]: string },
    log: (msg: string) => void,
    args: string[],
    options: SpawnOptions,
): Promise<IExecutionResult<string>> {
    const start = Date.now();
    const child = internalSpawn(gitPath, env, log, args, options);

    if (options.onSpawn) {
        options.onSpawn(child);
    }

    if (options.input) {
        if (!child.stdin) {
            throw new Error("stdin not available");
        }
        child.stdin.end(options.input, "utf8");
    }

    const pid = child.pid;
    const invocId = `CMD_1_${runCounter++}`;
    log(`${invocId} > (PID = ${pid}) ${child.spawnfile} ${child.spawnargs.join(" ")}`);

    const execResult = await exec(child, options.abortSignal);

    const duration = Temporal.Duration.from({ milliseconds: Date.now() - start })
    // TODO Remove ponyfill once VSCode updates to NodeJS v23 or higher
    const durationStr = new DurationFormat("en", { style: "narrow" }).format(duration);

    if (isErr(execResult)) {
        log(`${invocId} < ERROR (PID = ${pid}; Duration = ${durationStr})`);
        throw unwrap(execResult);
    }

    const bufferResult = unwrap(execResult);

    if (bufferResult.stderr.length > 0) {
        log(`${invocId} [${options.log_mode}] < [STDERR] ${JSON.stringify(bufferResult.stderr)}\n`);
    }
    let out = JSON.stringify(bufferResult.stdout.toString("utf-8"));
    if (out.length > 150) {
        out = out.slice(0, 150) + `" (${out.length - 150} chars hidden)`;
    }
    log(`${invocId} [${options.log_mode}] < [STDOUT] ${out}\n`);
    log(`${invocId} < SUCCESS (PID = ${pid}; Duration = ${durationStr})`);

    const result: IExecutionResult<string> = {
        exitCode: bufferResult.exitCode,
        stderr: bufferResult.stderr,
        stdout: bufferResult.stdout.toString("utf-8"),
    };

    if (bufferResult.exitCode) {
        return Promise.reject<IExecutionResult<string>>(
            new GitError({
                exitCode: result.exitCode,
                gitArgs: args,
                gitCommand: args[0],
                gitErrorCode: getGitErrorCode(result.stderr),
                message: "Failed to execute git",
                stderr: result.stderr,
                stdout: result.stdout,
            }),
        );
    }

    return result;
}
