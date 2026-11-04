import type { Model } from "../../../model.js";
import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as openChanges from "./changes/mod.js";
import * as openFile from "./file/mod.js";
import * as openRepository from "./open-repository.js";

export function createCommands(model: Model) {
    return [
        ...openChanges.createCommands(model),
        ...openFile.createCommands(model),
        selected.openRepository ? openRepository.createCommand(model) : pruned("openRepository"),
    ];
}
