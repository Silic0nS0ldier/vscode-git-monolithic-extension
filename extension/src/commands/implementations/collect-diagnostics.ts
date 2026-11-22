import type { ExtensionContext } from "vscode";
import { DiagnosticsManager } from "../../diagnostics/manager.js";
import type { Git } from "../../git.js";
import type { Model } from "../../model.js";
import { makeCommandId, type ScmCommand } from "../helpers.js";

export function createCommand(
    context: ExtensionContext,
    model: Model,
    git: Git,
): ScmCommand<"collectDiagnostics"> {
    const diagnostics = new DiagnosticsManager(context, model, git);
    return {
        commandId: makeCommandId("collectDiagnostics"),
        disposable: diagnostics,
        method: () => diagnostics.collect(),
        options: {},
    };
}
