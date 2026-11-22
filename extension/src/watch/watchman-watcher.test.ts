import test from "ava";
import { Client } from "fb-watchman";
import * as os from "node:os";
import * as path from "node:path";
import { createWatchmanWatcher } from "./watchman-watcher.js";

type CommandCallback = (failure: Error | null, response: Record<string, unknown>) => void;

test("Subscribes from a clock and normalizes Watchman file paths", async t => {
    const commands: unknown[][] = [];
    const events: unknown[] = [];
    const indexName = `watchman-index-${process.pid}`;
    const indexPath = path.join(os.tmpdir(), indexName);
    const refsName = `watchman-refs-${process.pid}`;
    const refsPath = path.join(os.tmpdir(), refsName);

    const client = new Proxy(new Client(), {
        get(target, property) {
            if (property === "capabilityCheck") {
                return (_capabilities: unknown, done: CommandCallback): void => {
                    done(null, {});
                };
            }
            if (property === "command") {
                return (args: unknown[], done: CommandCallback): void => {
                    commands.push(args);
                    switch (args[0]) {
                        case "watch-project":
                            done(null, { relative_path: ".git", watch: "/repository" });
                            return;
                        case "clock":
                            done(null, { clock: "c:1:1" });
                            return;
                        case "subscribe":
                            done(null, { subscribe: String(args[2]) });
                            return;
                        default:
                            done(new Error(`Unexpected command: ${String(args[0])}`), {});
                    }
                };
            }
            if (property === "end") {
                return (): void => {};
            }

            const value: unknown = Reflect.get(target, property);
            if (typeof value === "function") {
                return (...args: unknown[]): unknown => Reflect.apply(value, target, args);
            }
            return value;
        },
    });

    const watcher = createWatchmanWatcher(
        {
            debounceMs: 0,
            id: "test",
            ignore: () => false,
            onEvent: event => events.push(event),
            targets: [
                { path: indexPath, recursive: false },
                { path: refsPath, recursive: true },
            ],
        },
        client,
    );
    await watcher.ready;

    const subscription = commands.find(command => command[0] === "subscribe");
    t.deepEqual(subscription, [
        "subscribe",
        "/repository",
        "git-monolithic-0",
        {
            defer_vcs: false,
            expression: ["name", indexName, "wholename"],
            fields: ["name", "exists", "type"],
            relative_root: ".git",
            since: "c:1:1",
        },
    ]);
    t.deepEqual(commands.find(command => command[0] === "subscribe" && command[2] === "git-monolithic-1"), [
        "subscribe",
        "/repository",
        "git-monolithic-1",
        {
            defer_vcs: false,
            expression: [
                "anyof",
                ["name", refsName, "wholename"],
                ["dirname", refsName],
            ],
            fields: ["name", "exists", "type"],
            relative_root: ".git",
            since: "c:1:1",
        },
    ]);

    client.emit("subscription", {
        files: [{ exists: false, name: indexName, type: "f" }],
        root: "/repository",
        subscription: "git-monolithic-0",
    });
    t.deepEqual(events, [{ event: "unlink", path: indexPath, watchable: true }]);
    watcher.dispose();
});

test("Readiness settles when the Watchman executable cannot be started", async t => {
    const watcher = createWatchmanWatcher(
        {
            debounceMs: 0,
            id: "test",
            ignore: () => false,
            onEvent: () => {},
            targets: [{ path: os.tmpdir(), recursive: true }],
        },
        new Client({ watchmanBinaryPath: path.join(os.tmpdir(), "missing-watchman-executable") }),
    );

    await watcher.ready;
    t.pass();
    watcher.dispose();
});
