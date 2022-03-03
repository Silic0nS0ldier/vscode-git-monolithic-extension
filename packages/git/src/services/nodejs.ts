// service bindings for NodeJS

import { spawn } from "child_process";
import { existsSync as exists } from "fs";
import which from "which";
import { AllServices } from "./mod.js";

export function createServices(): AllServices {
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
    };
}
