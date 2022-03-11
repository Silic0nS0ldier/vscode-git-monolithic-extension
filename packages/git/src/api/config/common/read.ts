import type { GitContext } from "../../../cli/context.js";
import { ReadToErrors, readToString } from "../../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../../../errors.js";
import { err, isErr, ok, Result, unwrap } from "../../../func-result.js";

type Scope = "local" | "worktree" | "global" | "system";

export type ConfigValue = { from: Scope; value: string };

function isKnownScope(scope: string): scope is Scope {
    return ["local", "worktree", "global", "system"].includes(scope);
}

export async function read(
    git: GitContext,
    cwd: string,
    scope: Scope,
    key: string,
): Promise<Result<ConfigValue, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, [`--${scope}`, "--show-scope", key]);

    if (isErr(result)) {
        return result;
    }

    const data = unwrap(result).trim();

    if (data.includes("error: key does not contain a section:")) {
        // name must include section e.g. user.name (user is the section)
        return err(createError(ERROR_GENERIC, "Section missing from key"));
    }

    if (data === "") {
        return err(createError(ERROR_GENERIC, "Key not set"));
    }

    // TODO What if value has tabs?
    const [from, value] = data.split("\t");

    if (!isKnownScope(from)) {
        // Will occur if git adds a new config source e.g. worktree
        return err(createError(ERROR_GENERIC, `Value sourced from unknown scope`));
    }

    return ok({
        from,
        value,
    });
}
