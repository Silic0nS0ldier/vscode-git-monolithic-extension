import * as pullFrom from "./pull-from.js";
import * as pullRebase from "./pull-rebase.js";
import * as pull from "./pull.js";

export function createCommands() {
    return [
        pull.createCommand(),
        pullFrom.createCommand(),
        pullRebase.createCommand(),
    ];
}
