import type { OutputChannel } from "vscode";
import { makeCommandId, type ScmCommand } from "../helpers.js";

export function createCommand(outputChannel: OutputChannel) {
    return {
        commandId: makeCommandId("showOutput"),
        method: () => outputChannel.show(),
        options: {},
    } satisfies ScmCommand<"showOutput">;
}
