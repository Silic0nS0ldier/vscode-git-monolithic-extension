import type { Git } from "../../../git.js";
import type { Model } from "../../../model.js";
import type { TelemetryReporter } from "@vscode/extension-telemetry";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { cloneRepository } from "./helpers.js";

export function createCommand(model: Model, telemetryReporter: TelemetryReporter, git: Git): ScmCommand {
    async function clone(url?: string, parentPath?: string): Promise<void> {
        await cloneRepository(model, telemetryReporter, git, url, parentPath);
    }

    return {
        commandId: makeCommandId("clone"),
        method: clone,
        options: {},
    };
}
