import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as syncRebase from "./sync-rebase.js";
import * as sync from "./sync.js";

export function createCommands() {
    return [
        selected.sync ? sync.createCommand() : pruned("sync"),
        selected.syncRebase ? syncRebase.createCommand() : pruned("syncRebase"),
    ];
}
