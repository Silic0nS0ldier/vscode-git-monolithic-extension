import type { Model } from "../../../../model.js";
import { pruned } from "../../../pruned.js";
import * as selected from "../../../selection.gen.js";
import * as openFile2 from "./open-file-2.js";
import * as openFile from "./open-file.js";
import * as openHeadFile from "./open-head-file.js";

export function createCommands(model: Model) {
    return [
        selected.openFile ? openFile.createCommand(model) : pruned("openFile"),
        selected.openFile2 ? openFile2.createCommand(model) : pruned("openFile2"),
        selected.openHEADFile ? openHeadFile.createCommand(model) : pruned("openHEADFile"),
    ];
}
