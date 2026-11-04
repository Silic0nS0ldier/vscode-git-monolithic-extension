import type { Model } from "../../../model.js";
import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as unstageAll from "./unstage-all.js";
import * as unstage from "./unstage.js";

export function createCommands(model: Model) {
    return [
        selected.unstage ? unstage.createCommand(model) : pruned("unstage"),
        selected.unstageAll ? unstageAll.createCommand() : pruned("unstageAll"),
    ];
}
