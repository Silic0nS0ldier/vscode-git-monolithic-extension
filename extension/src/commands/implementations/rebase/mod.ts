import * as rebaseAbort from "./rebase-abort.js";
import * as rebase from "./rebase.js";

export function createCommands() {
    return [
        rebase.createCommand(),
        rebaseAbort.createCommand(),
    ];
}
