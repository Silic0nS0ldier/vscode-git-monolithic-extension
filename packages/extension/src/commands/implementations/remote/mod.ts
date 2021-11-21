import { Model } from "../../../model.js";
import { ScmCommand } from "../../helpers.js";
import * as addRemote from "./add-remote.js";
import * as removeRemote from "./remove-remote.js";

export function createCommands(model: Model): ScmCommand[] {
	return [
		addRemote.createCommand(model),
		removeRemote.createCommand(),
	]
}
