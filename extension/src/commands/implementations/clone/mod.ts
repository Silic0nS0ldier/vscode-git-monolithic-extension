import type { Git } from "../../../git.js";
import type { Model } from "../../../model.js";
import type { TelemetryReporter } from "../../../package-patches/vscode-extension-telemetry.js";
import type { ScmCommand } from "../../helpers.js";
import * as cloneRecursive from "./clone-recursive.js";
import * as clone from "./clone.js";

export function createCommands(model: Model, telemetryReporter: TelemetryReporter, git: Git): ScmCommand[] {
    return [
        clone.createCommand(model, telemetryReporter, git),
        cloneRecursive.createCommand(model, telemetryReporter, git),
    ];
}
