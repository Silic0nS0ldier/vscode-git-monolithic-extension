import { Uri } from "vscode";
import type { CommitOptions } from "../../api/git.js";
import type { Repository } from "../../git.js";
import type { Commit } from "../../git/Commit.js";
import * as config from "../../util/config.js";
import { Operation } from "../Operations.js";
import type { RunFn } from "./run.js";

export async function commit(
    run: RunFn<void>,
    rebaseCommit: Commit | undefined,
    root: string,
    repository: Repository,
    message: string | undefined,
    opts: CommitOptions = {},
): Promise<void> {
    if (rebaseCommit) {
        await run(Operation.RebaseContinue, async () => {
            if (opts.all) {
                const addOpts = opts.all === "tracked" ? { update: true } : {};
                await repository.add([], addOpts);
            }

            await repository.rebaseContinue();
        });
    } else {
        await run(Operation.Commit, async () => {
            if (opts.all) {
                const addOpts = opts.all === "tracked" ? { update: true } : {};
                await repository.add([], addOpts);
            }

            delete opts.all;

            if (opts.requireUserConfig === undefined || opts.requireUserConfig === null) {
                opts.requireUserConfig = config.requireGitUserConfig(Uri.file(root));
            }

            await repository.commit(message, opts);
        });
    }
}
