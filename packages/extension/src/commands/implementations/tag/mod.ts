import type { ScmCommand } from "../../helpers.js";
import * as createTag from "./create-tag.js";
import * as deleteTag from "./delete-tag.js";

export function createCommands(): ScmCommand[] {
    return [
        createTag.createCommand(),
        deleteTag.createCommand(),
    ];
}
