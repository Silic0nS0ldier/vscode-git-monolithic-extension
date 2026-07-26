import type { LogFn, SpawnFn } from "../cli/create.js";

export type FsService = {
    fs: {
        exists: (path: string) => boolean;
    };
};

export type ShellService = {
    shell: {
        which: (cmd: string, options: { path: string; pathExt?: string, nothrow: true }) => Promise<string|null>;
    };
};

export type ChildProcessService = {
    child_process: {
        spawn: SpawnFn;
    };
};

export type ProcessService = {
    process: {
        env: NodeJS.ProcessEnv;
    };
};

export type OsService = {
    os: {
        platform: string;
    };
};

export type LogService = {
    log?: LogFn,
};

export type AllServices =
    & FsService
    & ShellService
    & ChildProcessService
    & ProcessService
    & OsService
    & LogService;
