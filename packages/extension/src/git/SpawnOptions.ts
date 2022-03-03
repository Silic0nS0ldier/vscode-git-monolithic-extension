import * as cp from "node:child_process";
import { CancellationToken } from "vscode";


export interface SpawnOptions extends cp.SpawnOptions {
    input?: string;
    encoding?: string;
    cancellationToken?: CancellationToken;
    onSpawn?: (childProcess: cp.ChildProcess) => void;
    log_mode?: "stream" | "buffer";
}
