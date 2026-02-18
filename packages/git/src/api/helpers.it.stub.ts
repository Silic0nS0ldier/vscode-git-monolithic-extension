import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { runfiles } from "@bazel/runfiles";
import { fromPath } from "../cli/from-path.js";
import type { PersistentCLIContext } from "../cli/mod.js";
import { createServices } from "../services/nodejs.js";
import { isErr, unwrap } from "../func-result.js";
import { init } from "./repository/init/mod.js";

export const services = createServices();

export const gitCtx = await (async () => {
    const gitPath = runfiles.resolve("git/git");
    const persistentContext: PersistentCLIContext = { env: process.env, timeout: 5_000 };
    const result = await fromPath(gitPath, persistentContext, services);
    if (isErr(result)) {
        throw unwrap(result);
    }
    return unwrap(result);
})();

export async function tempGitRepo(initialCommit: boolean = false) {
    const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "git-interop-test"));
    const result = await init(gitCtx, repoPath);
    if (isErr(result)) {
        throw unwrap(result);
    }

    if (initialCommit) {
        const commitResult = await gitCtx.cli({ cwd: repoPath }, ["commit", "--allow-empty", "-m", "Initial commit"]);
        if (isErr(commitResult)) {
            throw unwrap(commitResult);
        }
    }

    return {
        path: repoPath,
        async [Symbol.asyncDispose]() {
            await fs.rm(repoPath, { recursive: true, force: true });
        },
    };
}
