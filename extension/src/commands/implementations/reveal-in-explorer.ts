import { commands, Uri } from "vscode";
import type { Resource } from "../../repository/Resource.js";
import { makeCommandId, type ScmCommand } from "../helpers.js";

export function createCommand(): ScmCommand {
    async function revealInExplorer(resourceState: Resource): Promise<void> {
        if (!resourceState) {
            return;
        }

        if (!(resourceState.state.resourceUri instanceof Uri)) {
            return;
        }

        await commands.executeCommand("revealInExplorer", resourceState.state.resourceUri);
    }

    return {
        commandId: makeCommandId("revealInExplorer"),
        method: revealInExplorer,
        options: {},
    };
}
