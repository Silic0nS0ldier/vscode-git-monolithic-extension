import { Uri, workspace } from "vscode";
import { CommitOptions } from "../../api/git.js";
import { Repository } from "../../git.js";
import { Commit } from "../../git/Commit.js";
import { Operation } from "../Operations.js";
import { RunFn } from "./run.js";

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
                const config = workspace.getConfiguration("git", Uri.file(root));
                opts.requireUserConfig = config.get<boolean>("requireGitUserConfig");
            }

            await repository.commit(message, opts);
        });
    }
}
