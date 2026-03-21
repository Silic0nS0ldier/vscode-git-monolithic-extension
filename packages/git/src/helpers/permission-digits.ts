import { createError, ERROR_GENERIC, type GenericError } from "../errors.js";
import { err, ok, type Result } from "../func-result.js";

export function matchPermissionDigits(str: string): Result<string, GenericError> {
    const matches = /^(?<perm>\d{6}).*$/.exec(str);
    if (!matches) {
        return err(createError(ERROR_GENERIC, `Invalid permission string: ${str}`));
    }
    const match = matches.groups?.perm;
    if (!match) {
        return err(createError(ERROR_GENERIC, `Permission digits not found in string: ${str}`));
    }
    return ok(match);
}

// From https://stackoverflow.com/a/60128480
const execBitmask = 0o111;

export function permHasExecutableBit(perm: number): boolean {
    return !!(perm & execBitmask);
}
