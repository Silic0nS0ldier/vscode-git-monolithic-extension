import * as checkoutDetached from "./checkout-detached.js";
import * as checkout from "./checkout.js";

export function createCommands() {
    return [
        checkout.createCommand(),
        checkoutDetached.createCommand(),
    ];
}
