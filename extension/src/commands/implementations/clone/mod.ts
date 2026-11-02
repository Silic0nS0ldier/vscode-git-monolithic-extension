import type { TelemetryReporter } from "@vscode/extension-telemetry";
import type { Git } from "../../../git.js";
import { pruned } from "../../pruned.js";
import * as selected from "../../selection.gen.js";
import * as cloneRecursive from "./clone-recursive.js";
import * as clone from "./clone.js";

export function createCommands(telemetryReporter: TelemetryReporter, git: Git) {
    return [
        selected.clone ? clone.createCommand(telemetryReporter, git) : pruned("clone"),
        selected.cloneRecursive
            ? cloneRecursive.createCommand(telemetryReporter, git)
            : pruned("cloneRecursive"),
    ];
}
