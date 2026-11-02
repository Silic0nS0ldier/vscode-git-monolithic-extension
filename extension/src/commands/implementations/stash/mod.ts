import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as stashApplyLatest from "./stash-apply-latest.js";
import * as stashApply from "./stash-apply.js";
import * as stashDrop from "./stash-drop.js";
import * as stashIncludeUntracked from "./stash-include-untracked.js";
import * as stashPopLatest from "./stash-pop-latest.js";
import * as stashPop from "./stash-pop.js";
import * as stash from "./stash.js";

export function createCommands() {
    return [
        selected.stash ? stash.createCommand() : pruned("stash"),
        selected.stashApply ? stashApply.createCommand() : pruned("stashApply"),
        selected.stashApplyLatest ? stashApplyLatest.createCommand() : pruned("stashApplyLatest"),
        selected.stashDrop ? stashDrop.createCommand() : pruned("stashDrop"),
        selected.stashIncludeUntracked
            ? stashIncludeUntracked.createCommand()
            : pruned("stashIncludeUntracked"),
        selected.stashPop ? stashPop.createCommand() : pruned("stashPop"),
        selected.stashPopLatest ? stashPopLatest.createCommand() : pruned("stashPopLatest"),
    ];
}
