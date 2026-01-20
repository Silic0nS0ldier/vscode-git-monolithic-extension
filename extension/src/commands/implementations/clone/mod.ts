import type { Git } from "../../../git.js";
import type { TelemetryReporter } from "@vscode/extension-telemetry";
import type { ScmCommand } from "../../helpers.js";
import * as cloneRecursive from "./clone-recursive.js";
import * as clone from "./clone.js";

export function createCommands(telemetryReporter: TelemetryReporter, git: Git): ScmCommand[] {
    return [
        clone.createCommand(telemetryReporter, git),
        cloneRecursive.createCommand(telemetryReporter, git),
    ];
}
