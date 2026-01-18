import type { LogFn, SpawnFn } from "../cli/create.js";

export type AllServices = {
    fs: {
        exists: (path: string) => boolean;
    };
    shell: {
        which: (cmd: string, options: { path: string; pathExt?: string, nothrow: true }) => Promise<string|null>;
    };
    child_process: {
        spawn: SpawnFn;
    };
    process: {
        env: NodeJS.ProcessEnv;
    };
    os: {
        platform: string;
    };
    log?: LogFn,
};
