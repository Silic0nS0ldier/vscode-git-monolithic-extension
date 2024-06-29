import type { AbstractRepository } from "../../../repository/repository-class/AbstractRepository.js";
import type { ScmCommand } from "../../helpers.js";
import { checkout } from "./checkout.js";

export function createCommand(): ScmCommand {
    async function checkoutDetached(repository: AbstractRepository, treeish?: string): Promise<boolean> {
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
