import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as rebaseAbort from "./rebase-abort.js";
import * as rebase from "./rebase.js";

export function createCommands() {
    return [
        selected.rebase ? rebase.createCommand() : pruned("rebase"),
        selected.rebaseAbort ? rebaseAbort.createCommand() : pruned("rebaseAbort"),
    ];
}
