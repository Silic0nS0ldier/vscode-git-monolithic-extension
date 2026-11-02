import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as removeRemote from "./remove-remote.js";

export function createCommands() {
    return [
        selected.removeRemote ? removeRemote.createCommand() : pruned("removeRemote"),
    ];
}
