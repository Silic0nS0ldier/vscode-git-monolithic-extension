import { ScmCommand } from "../../helpers.js";
import * as fetchAll from "./fetch-all.js";
import * as fetchPrune from "./fetch-prune.js";
import * as fetch from "./fetch.js";

export function createCommands(): ScmCommand[] {
    return [
        fetch.createCommand(),
        fetchAll.createCommand(),
        fetchPrune.createCommand(),
    ];
}
