import * as syncRebase from "./sync-rebase.js";
import * as sync from "./sync.js";

export function createCommands() {
    return [
        sync.createCommand(),
        syncRebase.createCommand(),
    ];
}
