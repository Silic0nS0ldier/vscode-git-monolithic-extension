import type { ScmCommand } from "../../helpers.js";
import * as stashApplyLatest from "./stash-apply-latest.js";
import * as stashApply from "./stash-apply.js";
import * as stashDrop from "./stash-drop.js";
import * as stashIncludeUntracked from "./stash-include-untracked.js";
import * as stashPopLatest from "./stash-pop-latest.js";
import * as stashPop from "./stash-pop.js";
import * as stash from "./stash.js";

export function createCommands(): ScmCommand[] {
    return [
        stash.createCommand(),
        stashApply.createCommand(),
        stashApplyLatest.createCommand(),
        stashDrop.createCommand(),
        stashIncludeUntracked.createCommand(),
        stashPop.createCommand(),
        stashPopLatest.createCommand(),
    ];
}
