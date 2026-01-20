import type { ScmCommand } from "../../helpers.js";
import * as syncRebase from "./sync-rebase.js";
import * as sync from "./sync.js";

export function createCommands(): ScmCommand[] {
    return [
        sync.createCommand(),
        syncRebase.createCommand(),
    ];
}
