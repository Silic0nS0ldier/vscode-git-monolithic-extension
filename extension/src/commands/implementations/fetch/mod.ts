import * as fetchAll from "./fetch-all.js";
import * as fetchPrune from "./fetch-prune.js";
import * as fetch from "./fetch.js";

export function createCommands() {
    return [
        fetch.createCommand(),
        fetchAll.createCommand(),
        fetchPrune.createCommand(),
    ];
}
