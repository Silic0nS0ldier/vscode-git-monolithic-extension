import { OutputChannel, SourceControlResourceState, Uri } from "vscode";
import { Model } from "../../../../model.js";
import { Resource } from "../../../../repository.js";
import { ScmCommand } from "../../../helpers.js";
import { openFile } from "./open-file.js";

// TODO Merge with `openFile`, since they are identical
export function createCommand(model: Model, outputChannel: OutputChannel): ScmCommand {
    async function openFile2(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
        await openFile(model, outputChannel, arg, ...resourceStates);
    }

    return {
        commandId: "git.openFile2",
        method: openFile2,
        options: {},
    };
}
