import intoStream from "into-stream";
import { Readable } from "node:stream";
import type { ChildProcess, SpawnFn } from "./create.js";

export function createSpawn(endWith: "error" | "exit", options: {
    out?: string;
    err?: string;
    delay?: number;
    code?: number;
} = {}): SpawnFn {
    return () => {
        const cp: ChildProcess = {
            connected: true,
            kill: () => {
                // @ts-expect-error
                cp.connected = false;
                return true;
            },
            once: (event, listener) => {
                let fn: (() => Promise<void>) | null = null;
                if (event === "error" && endWith === "error") {
                    fn = async (): Promise<void> => {
                        if (cp.connected) {
                            // @ts-expect-error
                            listener(new Error());
                        }
                    };
                } else if (event === "exit" && endWith === "exit") {
                    fn = async (): Promise<void> => {
                        if (cp.connected) {
                            // @ts-expect-error
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
