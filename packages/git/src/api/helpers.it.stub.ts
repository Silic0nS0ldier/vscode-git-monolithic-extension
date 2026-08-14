import { runfiles } from "@bazel/runfiles";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fromPath } from "../cli/from-path.js";
import { readToString } from "../cli/helpers/read-to-string.js";
import type { PersistentCLIContext } from "../cli/mod.js";
import { unwrapOk } from "../errors.js";
import { isErr, unwrap } from "../func-result.js";
import { createServices } from "../services/nodejs.js";
import { init } from "./repository/init/mod.js";

export const services = createServices();

export const gitCtx = await (async () => {
    const rlocation = process.env["GIT_BIN_RLOCATION"];
    if (!rlocation) {
        throw new Error("GIT_BIN_RLOCATION is not set; it is provided by the js_test `env` attribute");
    }

    const gitPath = runfiles.resolve(rlocation);
    const persistentContext: PersistentCLIContext = { env: process.env, timeout: 5_000 };
    return unwrapOk(await fromPath(gitPath, persistentContext, services));
})();

/** Runs git for test setup, throwing rather than returning a result. */
export async function run(cwd: string, args: string[], env?: Record<string, string>): Promise<void> {
    const result = await gitCtx.cli({ cwd, env }, args);
    if (isErr(result)) {
        throw unwrap(result)._error;
    }
}

/** Reads git's output for test setup and assertions, throwing rather than returning a result. */
export async function read(cwd: string, args: string[]): Promise<string> {
    return unwrapOk(await readToString({ cli: gitCtx.cli, cwd }, args)).trim();
}

export async function tempGitRepo(initialCommit: boolean = false) {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "git-interop-test"));
    try {
        const result = await init(gitCtx, repoPath);
        if (isErr(result)) {
            throw unwrap(result)._error;
        }

        // Set up user config for commits
        const configResult = await gitCtx.cli({ cwd: repoPath }, [
            "config",
            "user.name",
            "Test User",
        ]);
        if (isErr(configResult)) {
            throw unwrap(configResult)._error;
        }
        const emailConfigResult = await gitCtx.cli({ cwd: repoPath }, [
            "config",
            "user.email",
            "test@example.com",
        ]);
        if (isErr(emailConfigResult)) {
            throw unwrap(emailConfigResult)._error;
        }

        if (initialCommit) {
            const commitResult = await gitCtx.cli({ cwd: repoPath }, [
                "commit",
                "--allow-empty",
                "-m",
                "Initial commit",
            ]);
            if (isErr(commitResult)) {
                throw unwrap(commitResult)._error;
            }
        }

        return {
            path: repoPath,
            async [Symbol.asyncDispose]() {
                await fs.rm(repoPath, { recursive: true, force: true });
            },
        };
    } catch (error) {
        // Clean up the directory if initialization fails
        await fs.rm(repoPath, { recursive: true, force: true });
        throw error;
    }
}
