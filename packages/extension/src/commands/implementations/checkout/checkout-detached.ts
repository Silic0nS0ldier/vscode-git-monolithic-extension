import { FinalRepository } from "../../../repository/repository-class/mod.js";
import { ScmCommand } from "../../helpers.js";
import { checkout } from "./checkout.js";

export function createCommand(): ScmCommand {
    async function checkoutDetached(repository: FinalRepository, treeish?: string): Promise<boolean> {
        return checkout(repository, { detached: true, treeish });
    }

    return {
        commandId: "git.checkoutDetached",
        method: checkoutDetached,
        options: {
            repository: true,
        },
    };
}
