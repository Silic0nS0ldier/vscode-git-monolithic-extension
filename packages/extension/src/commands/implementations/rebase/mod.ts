import { ScmCommand } from "../../helpers.js";
import * as rebaseAbort from "./rebase-abort.js";
import * as rebase from "./rebase.js";

export function createCommands(): ScmCommand[] {
	return [
		rebase.createCommand(),
		rebaseAbort.createCommand(),
	]
}
