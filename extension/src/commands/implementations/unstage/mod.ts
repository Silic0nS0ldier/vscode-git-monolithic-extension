import type { Model } from "../../../model.js";
import * as unstageAll from "./unstage-all.js";
import * as unstage from "./unstage.js";

export function createCommands(model: Model) {
    return [
        unstage.createCommand(model),
        unstageAll.createCommand(),
    ];
}
