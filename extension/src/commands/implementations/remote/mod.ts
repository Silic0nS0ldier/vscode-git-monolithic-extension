import type { ScmCommand } from "../../helpers.js";
import * as removeRemote from "./remove-remote.js";

export function createCommands(): ScmCommand[] {
    return [
        removeRemote.createCommand(),
    ];
}
