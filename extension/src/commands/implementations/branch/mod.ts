import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as branchFrom from "./branch-from.js";
import * as branch from "./branch.js";
import * as deleteBranch from "./delete-branch.js";
import * as renameBranch from "./rename-branch.js";

export function createCommands() {
    return [
        selected.branch ? branch.createCommand() : pruned("branch"),
        selected.branchFrom ? branchFrom.createCommand() : pruned("branchFrom"),
        selected.deleteBranch ? deleteBranch.createCommand() : pruned("deleteBranch"),
        selected.renameBranch ? renameBranch.createCommand() : pruned("renameBranch"),
    ];
}
