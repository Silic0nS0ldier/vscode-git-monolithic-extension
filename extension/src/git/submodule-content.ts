import { GitErrorCodes } from "../api/git.js";
import { GitError } from "./error.js";

export async function readSubmoduleCommit(details: () => Promise<{ object: string }>): Promise<Uint8Array> {
    try {
        const { object } = await details();
        return new TextEncoder().encode(`Subproject commit ${object}\n`);
    } catch (ex) {
        if (ex instanceof GitError && ex.gitErrorCode === GitErrorCodes.UnknownPath) return new Uint8Array();
        throw ex;
    }
}
