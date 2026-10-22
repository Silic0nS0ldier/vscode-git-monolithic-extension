import * as removeRemote from "./remove-remote.js";

export function createCommands() {
    return [
        removeRemote.createCommand(),
    ];
}
