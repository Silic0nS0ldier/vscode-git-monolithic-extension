import type { Model } from "../../../model.js";
import type { ScmCommand } from "../../helpers.js";
import * as syncRebase from "./sync-rebase.js";
import * as sync from "./sync.js";

export function createCommands(model: Model): ScmCommand[] {
    return [
        sync.createCommand(model),
        syncRebase.createCommand(model),
    ];
}
