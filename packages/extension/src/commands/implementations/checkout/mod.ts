import { ScmCommand } from "../../helpers.js";
import * as checkoutDetached from "./checkout-detached.js";
import * as checkout from "./checkout.js";

export function createCommands(): ScmCommand[] {
	return [
		checkout.createCommand(),
		checkoutDetached.createCommand(),
	]
}
