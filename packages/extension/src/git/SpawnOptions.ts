import type * as cp from "node:child_process";

export interface SpawnOptions extends cp.SpawnOptions {
    input?: string;
    abortSignal?: AbortSignal;
    onSpawn?: (childProcess: cp.ChildProcess) => void;
    log_mode?: "stream" | "buffer";
}
