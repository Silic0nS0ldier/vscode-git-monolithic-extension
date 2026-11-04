import type { Model } from "../../../model.js";
import * as cleanAllTracked from "./clean-all-tracked.js";
import * as cleanAllUntracked from "./clean-all-untracked.js";
import * as cleanAll from "./clean-all.js";
import * as clean from "./clean.js";

export function createCommands(model: Model) {
    return [
        clean.createCommand(model),
        cleanAll.createCommand(),
        cleanAllTracked.createCommand(),
        cleanAllUntracked.createCommand(),
    ];
}
