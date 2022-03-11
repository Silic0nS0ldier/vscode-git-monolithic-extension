import { getGitErrorCode, GitError } from "../error.js";
import { exec, IExecutionResult } from "../exec.js";
import { SpawnOptions } from "../SpawnOptions.js";
import { internalSpawn } from "./internal-spawn.js";

export async function internalExec(
    gitPath: string,
    env: { [key: string]: string },
    log: (msg: string) => void,
    args: string[],
    options: SpawnOptions,
): Promise<IExecutionResult<string>> {
    const child = internalSpawn(gitPath, env, log, args, options);

    if (options.onSpawn) {
        options.onSpawn(child);
    }

    if (options.input) {
        child.stdin!.end(options.input, "utf8");
    }

    const bufferResult = await exec(child, options.abortSignal);

    if (bufferResult.stderr.length > 0) {
        log(`PID_${child.pid} [${options.log_mode}] < [ERR] ${JSON.stringify(bufferResult.stderr)}\n`);
    }
    let out = JSON.stringify(bufferResult.stdout.toString("utf-8"));
    if (out.length > 150) {
        out = out.slice(0, 150) + `" (${out.length - 150} chars hidden)`;
    }
    log(`PID_${child.pid} [${options.log_mode}] < ${out}\n`);

    const result: IExecutionResult<string> = {
        exitCode: bufferResult.exitCode,
        stderr: bufferResult.stderr,
        stdout: bufferResult.stdout.toString('utf-8'),
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
