import type { LogFn, SpawnFn } from "../cli/create.js";

export type AllServices = {
    fs: {
        exists: (path: string) => boolean;
    };
    shell: {
        which: (cmd: string, options: { path: string; pathExt: string }) => Promise<string>;
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
