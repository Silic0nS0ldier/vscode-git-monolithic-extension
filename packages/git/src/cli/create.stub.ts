import intoStream from "into-stream";
import { PassThrough, Readable, type Writable } from "node:stream";
import type { ChildProcess, SpawnFn } from "./create.js";

export function createSpawn(endWith: "error" | "exit", options: {
    out?: string;
    err?: string;
    delay?: number;
    code?: number;
    stdin?: Writable;
    /** Called for each `kill`, including those made after the process ended. */
    onKill?: (signal: number | NodeJS.Signals | undefined) => void;
} = {}): SpawnFn {
    return () => {
        let running = true;
        const cp: ChildProcess = {
            stdin: options.stdin ?? new PassThrough(),
            kill: signal => {
                options.onKill?.(signal);
                const wasRunning = running;
                running = false;
                return wasRunning;
            },
            once: (event, listener) => {
                let fn: (() => Promise<void>) | null = null;
                if (event === "error" && endWith === "error") {
                    fn = async (): Promise<void> => {
                        if (running) {
                            // @ts-expect-error `event` does not narrow `listener` to the matching `once` overload.
                            listener(new Error());
                        }
                    };
                } else if (event === "exit" && endWith === "exit") {
                    fn = async (): Promise<void> => {
                        if (running) {
                            running = false;
                            // @ts-expect-error `event` does not narrow `listener` to the matching `once` overload.
                            listener(options.code ?? 0, "SIGQUIT");
                        }
                    };
                }

                if (fn) {
                    if (options.delay) {
                        setTimeout(fn, options.delay);
                    } else {
                        fn();
                    }
                }

                return cp;
            },
            stderr: options.err ? intoStream(options.err) : new Readable({
                read(): void {
                    this.push(null);
                },
            }),
            stdout: options.out ? intoStream(options.out) : new Readable({
                read(): void {
                    this.push(null);
                },
            }),
        };

        return cp;
    };
}
