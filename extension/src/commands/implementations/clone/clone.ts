import type { Git } from "../../../git.js";
import type { TelemetryReporter } from "@vscode/extension-telemetry";
import { makeCommandId, type ScmCommand } from "../../helpers.js";
import { cloneRepository } from "./helpers.js";

export function createCommand(telemetryReporter: TelemetryReporter, git: Git): ScmCommand {
    async function clone(url?: string, parentPath?: string): Promise<void> {
        await cloneRepository(telemetryReporter, git, url, parentPath);
    }

    return {
        commandId: makeCommandId("clone"),
        method: clone,
        options: {},
    };
}
