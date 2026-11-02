import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as pullFrom from "./pull-from.js";
import * as pullRebase from "./pull-rebase.js";
import * as pull from "./pull.js";

export function createCommands() {
    return [
        selected.pull ? pull.createCommand() : pruned("pull"),
        selected.pullFrom ? pullFrom.createCommand() : pruned("pullFrom"),
        selected.pullRebase ? pullRebase.createCommand() : pruned("pullRebase"),
    ];
}
