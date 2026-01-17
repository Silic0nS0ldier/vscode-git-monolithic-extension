import type { GitContext } from "../../cli/context.js";
import { type ReadToErrors, readToString } from "../../cli/helpers/read-to-string.js";
import { createError, ERROR_GENERIC } from "../../errors.js";
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

    const [from, value] = data.split("\t", 1);

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
    from: Scope,
    key: string,
    value: string,
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

    for (const line in lines) {
        const [from, keyValue] = line.split("\t", 1);

        if (!isKnownScope(from)) {
            // Will occur if git adds a new config source e.g. worktree
            return err(createError(ERROR_GENERIC, `Value sourced from unknown scope`));
        }

        const [key, value] = keyValue.split("=", 1);

        entries.push({
            from,
            key,
            value,
        })
    }

    return ok(entries);
}
