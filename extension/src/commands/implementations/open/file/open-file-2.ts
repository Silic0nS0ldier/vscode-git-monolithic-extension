import type { SourceControlResourceState, Uri } from "vscode";
import type { Model } from "../../../../model.js";
import type { Resource } from "../../../../repository/Resource.js";
import { makeCommandId, type ScmCommand } from "../../../helpers.js";
import { openFile } from "./open-file.js";

// TODO Merge with `openFile`, since they are identical
export function createCommand(model: Model): ScmCommand<"openFile2"> {
    async function openFile2(arg?: Resource | Uri, ...resourceStates: SourceControlResourceState[]): Promise<void> {
        await openFile(model, arg, ...resourceStates);
    }

    return {
        commandId: makeCommandId("openFile2"),
        method: openFile2,
        options: {},
    };
}
