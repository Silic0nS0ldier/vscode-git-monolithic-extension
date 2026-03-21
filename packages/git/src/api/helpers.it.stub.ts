import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { runfiles } from "@bazel/runfiles";
import { fromPath } from "../cli/from-path.js";
import type { PersistentCLIContext } from "../cli/mod.js";
import { createServices } from "../services/nodejs.js";
import { isErr, unwrap } from "../func-result.js";
import { init } from "./repository/init/mod.js";
import { unwrapOk } from "../errors.js";

export const services = createServices();

export const gitCtx = await (async () => {
    const gitPath = runfiles.resolve("git/git");
    const persistentContext: PersistentCLIContext = { env: process.env, timeout: 5_000 };
    return unwrapOk(await fromPath(gitPath, persistentContext, services));
})();

export async function tempGitRepo(initialCommit: boolean = false) {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "git-interop-test"));
    try {
        const result = await init(gitCtx, repoPath);
        if (isErr(result)) {
            throw unwrap(result)._error;
        }

        // Set up user config for commits
        const configResult = await gitCtx.cli({ cwd: repoPath }, [
            "config", "user.name", "Test User",
        ]);
        if (isErr(configResult)) {
            throw unwrap(configResult)._error;
        }
        const emailConfigResult = await gitCtx.cli({ cwd: repoPath }, [
            "config", "user.email", "test@example.com",
        ]);
        if (isErr(emailConfigResult)) {
            throw unwrap(emailConfigResult)._error;
        }

        if (initialCommit) {
            const commitResult = await gitCtx.cli({ cwd: repoPath }, ["commit", "--allow-empty", "-m", "Initial commit"]);
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
