import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC, ERROR_NON_ZERO_EXIT } from "../../errors.js";
import { err, isErr, ok, type Result, unwrap } from "../../func-result.js";

export type Scope = "local" | "worktree" | "global" | "system";

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

    const [from, value] = data.split("\t", 2);

    if (!isKnownScope(from)) {
        // Will occur if git adds a new config source e.g. worktree
        return err(createError(ERROR_GENERIC, `Value sourced from unknown scope`));
    }

    return ok({
        from,
        value,
    });
}

export type ConfigEntry = {
    from: Scope;
    key: string;
    value: string;
};

export async function readAll(
    git: GitContext,
    cwd: string,
    scope: Scope,
): Promise<Result<ConfigEntry[], ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, [`--${scope}`, "--show-scope", "--list"]);

    if (isErr(result)) {
        return result;
    }

    const lines = unwrap(result).trim().split(/\r|\r\n|\n/);

    const entries: ConfigEntry[] = [];

    for (const line of lines) {
        const [from, keyValue] = line.split("\t", 2);

        if (!isKnownScope(from)) {
            // Will occur if git adds a new config source e.g. worktree
            return err(createError(ERROR_GENERIC, `Value sourced from unknown scope`));
        }

        const [key, value] = keyValue.split("=", 2);

        entries.push({
            from,
            key,
            value,
        });
    }

    return ok(entries);
}

/**
 * Reads a key using git's own scope precedence (worktree, then local, then global, then
 * system), the same as running `git config --get <key>` at a terminal. Resolves to
 * `undefined` when the key is not set anywhere. Wraps `git config --get <key>`.
 */
export async function readEffective(
    git: GitContext,
    cwd: string,
    key: string,
): Promise<Result<string | undefined, ReadToErrors>> {
    const result = await readToString({ cli: git.cli, cwd }, ["config", "--get", key]);

    if (isErr(result)) {
        const error = unwrap(result);
        if (error.type === ERROR_NON_ZERO_EXIT && error.cause.exitCode === 1) {
            if (error.cause.stderr.includes("error: key does not contain a section:")) {
                // name must include section e.g. user.name (user is the section)
                return err(createError(ERROR_GENERIC, "Section missing from key"));
            }
            // Otherwise exit code 1 means the key is simply unset.
            return ok(undefined);
        }
        // Any other exit code (e.g. a malformed config file) is a real failure.
        return result;
    }

    return ok(unwrap(result).trim());
}
