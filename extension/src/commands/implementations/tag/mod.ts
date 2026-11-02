import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as createTag from "./create-tag.js";
import * as deleteTag from "./delete-tag.js";

export function createCommands() {
    return [
        selected.createTag ? createTag.createCommand() : pruned("createTag"),
        selected.deleteTag ? deleteTag.createCommand() : pruned("deleteTag"),
    ];
}
