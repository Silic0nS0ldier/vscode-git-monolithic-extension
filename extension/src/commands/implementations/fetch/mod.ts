import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as fetchAll from "./fetch-all.js";
import * as fetchPrune from "./fetch-prune.js";
import * as fetch from "./fetch.js";

export function createCommands() {
    return [
        selected.fetch ? fetch.createCommand() : pruned("fetch"),
        selected.fetchAll ? fetchAll.createCommand() : pruned("fetchAll"),
        selected.fetchPrune ? fetchPrune.createCommand() : pruned("fetchPrune"),
    ];
}
