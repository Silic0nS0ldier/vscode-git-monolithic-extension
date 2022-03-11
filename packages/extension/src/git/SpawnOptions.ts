import type NAC from "node-abort-controller";
import type * as cp from "node:child_process";

export interface SpawnOptions extends cp.SpawnOptions {
    input?: string;
    abortSignal?: NAC.AbortSignal;
    onSpawn?: (childProcess: cp.ChildProcess) => void;
    log_mode?: "stream" | "buffer";
}
