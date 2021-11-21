import { ScmCommand } from "../../helpers.js";
import * as branchFrom from "./branch-from.js";
import * as branch from "./branch.js";
import * as renameBranch from "./rename-branch.js";
import * as deleteBranch from "./delete-branch.js";

export function createCommands(): ScmCommand[] {
	return [
		branch.createCommand(),
		branchFrom.createCommand(),
		deleteBranch.createCommand(),
		renameBranch.createCommand(),
	]
}