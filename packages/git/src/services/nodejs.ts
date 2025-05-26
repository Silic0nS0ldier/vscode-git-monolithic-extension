// service bindings for NodeJS

import { spawn } from "child_process";
import { existsSync as exists } from "fs";
import which from "which";
import type { AllServices } from "./mod.js";
import type { LogFn } from "../cli/create.js";

export function createServices(log?: LogFn): AllServices {
    return {
        child_process: {
            spawn,
        },
        fs: {
            exists,
        },
        os: {
            platform: process.platform,
        },
        process,
        shell: {
            which,
        },
        log,
    };
}
