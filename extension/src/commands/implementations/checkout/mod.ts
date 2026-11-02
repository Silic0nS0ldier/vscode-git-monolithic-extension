import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as checkoutDetached from "./checkout-detached.js";
import * as checkout from "./checkout.js";

export function createCommands() {
    return [
        selected.checkout ? checkout.createCommand() : pruned("checkout"),
        selected.checkoutDetached ? checkoutDetached.createCommand() : pruned("checkoutDetached"),
    ];
}
