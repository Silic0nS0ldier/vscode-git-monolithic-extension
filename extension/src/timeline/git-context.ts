import type { GitContext } from "monolithic-git-interop/cli";
import type { Git } from "../git.js";
import { cliEnv } from "../git/git-class/cli-env.js";

export function contextFor(git: Git, command: string): GitContext {
    const context = git._context;
    return {
        ...context,
        cli: (call, args) => context.cli({ ...call, env: cliEnv(git.env, command, call.env) }, args),
    };
}
