import {
    Client,
    type Expression,
    type FileChange,
    type SubscriptionConfig,
    type SubscriptionResponse,
    type WatchProjectResponse,
} from "fb-watchman";
import * as fs from "node:fs";
import * as path from "node:path";
import { inspect } from "node:util";
import { error, trace, warn } from "../tracing.js";
import type { WatchBackend, WatchBackendOptions, WatchTarget } from "./backend.js";

type ClockResponse = {
    readonly clock: string;
};

type TimedSubscriptionConfig = SubscriptionConfig & {
    readonly defer_vcs: boolean;
    readonly since: string;
};

type Subscription = {
    readonly basePath: string;
};

export function createWatchmanWatcher(options: WatchBackendOptions, client = new Client()): WatchBackend {
    const subscriptions = new Map<string, Subscription>();
    let closed = false;
    let lastReportedFailure: unknown;
    let nextSubscriptionId = 0;
    let rejectReady: ((failure: unknown) => void) | undefined;

    function reportFailure(failure: unknown): void {
        if (closed || lastReportedFailure === failure) {
            return;
        }
        lastReportedFailure = failure;
        error(`${options.id} watchman watcher failed: ${inspect(failure)}`);
    }

    function onSubscription(response: SubscriptionResponse): void {
        const subscription = subscriptions.get(response.subscription);
        if (subscription === undefined || closed) {
            return;
        }
        for (const file of response.files ?? []) {
            trace(`Watchman watcher delivered "${file.name}" from "${response.subscription}"`);
            options.onEvent({
                event: file.exists === false ? "unlink" : "change",
                path: path.resolve(subscription.basePath, file.name),
                watchable: true,
            });
        }
    }

    function onError(failure: Error): void {
        if (!closed) {
            reportFailure(failure);
            rejectReady?.(failure);
        }
    }

    function onEnd(): void {
        if (!closed) {
            const failure = new Error("The Watchman connection ended unexpectedly");
            reportFailure(failure);
            rejectReady?.(failure);
        }
    }

    client.on("subscription", onSubscription);
    client.on("error", onError);
    client.on("end", onEnd);

    const setupFailure = new Promise<never>((_, reject) => {
        rejectReady = reject;
    });
    const initialize = (async () => {
        await checkCapabilities(client);
        for (const target of options.targets) {
            await subscribe(client, target, `git-monolithic-${nextSubscriptionId++}`, subscriptions, options);
        }
    })();
    const ready = Promise.race([initialize, setupFailure])
        .catch(reportFailure)
        .finally(() => {
            rejectReady = undefined;
        });

    return {
        dispose(): void {
            if (closed) {
                return;
            }
            closed = true;
            subscriptions.clear();
            client.off("subscription", onSubscription);
            client.off("error", onError);
            client.off("end", onEnd);
            client.end();
        },
        ready,
    };
}

function checkCapabilities(client: Client): Promise<void> {
    return new Promise((resolve, reject) => {
        client.capabilityCheck({ optional: [], required: ["relative_root"] }, failure => {
            if (failure) {
                reject(failure);
            } else {
                resolve();
            }
        });
    });
}

async function subscribe(
    client: Client,
    target: WatchTarget,
    subscriptionName: string,
    subscriptions: Map<string, Subscription>,
    options: WatchBackendOptions,
): Promise<void> {
    const basePath = nearestExistingDirectory(target.recursive ? target.path : path.dirname(target.path));
    const watched = await watchProject(client, basePath);
    if (typeof watched.watch !== "string" || watched.watch.length === 0) {
        throw new Error("Watchman did not return a watch root");
    }
    if (watched.warning !== undefined) {
        warn(`${options.id} watchman watcher notice: ${watched.warning}`);
    }

    const clocked = await clock(client, watched.watch);
    if (typeof clocked.clock !== "string" || clocked.clock.length === 0) {
        throw new Error("Watchman did not return a clock");
    }

    subscriptions.set(subscriptionName, { basePath });
    const subscription: TimedSubscriptionConfig = {
        defer_vcs: false,
        expression: expressionForTarget(target, basePath),
        fields: ["name", "exists", "type"] satisfies (keyof FileChange)[],
        since: clocked.clock,
    };
    if (watched.relative_path !== undefined) {
        subscription.relative_root = watched.relative_path;
    }

    try {
        await subscribeCommand(client, watched.watch, subscriptionName, subscription);
    } catch (failure) {
        subscriptions.delete(subscriptionName);
        throw failure;
    }
}

function watchProject(client: Client, targetPath: string): Promise<WatchProjectResponse> {
    return new Promise((resolve, reject) => {
        client.command(["watch-project", targetPath], (failure, response) => {
            if (failure) {
                reject(failure);
            } else {
                resolve(response);
            }
        });
    });
}

function clock(client: Client, watchRoot: string): Promise<ClockResponse> {
    return new Promise((resolve, reject) => {
        client.command(["clock", watchRoot], (failure, response: ClockResponse) => {
            if (failure) {
                reject(failure);
            } else {
                resolve(response);
            }
        });
    });
}

function subscribeCommand(
    client: Client,
    watchRoot: string,
    subscriptionName: string,
    subscription: SubscriptionConfig,
): Promise<void> {
    return new Promise((resolve, reject) => {
        client.command(["subscribe", watchRoot, subscriptionName, subscription], failure => {
            if (failure) {
                reject(failure);
            } else {
                resolve();
            }
        });
    });
}

function expressionForTarget(target: WatchTarget, basePath: string): Expression {
    const relativeTarget = path.relative(basePath, target.path);
    const name = toWatchmanPath(relativeTarget);
    if (!target.recursive) {
        return ["name", name, "wholename"];
    }
    if (name === "") {
        return ["true"];
    }
    return [
        "anyof",
        ["name", name, "wholename"],
        ["dirname", name],
    ];
}

function nearestExistingDirectory(start: string): string {
    let current = start;
    while (true) {
        try {
            if (fs.statSync(current).isDirectory()) {
                return current;
            }
        } catch (failure) {
            if (
                !(failure instanceof Error)
                || !("code" in failure)
                || (failure.code !== "ENOENT" && failure.code !== "ENOTDIR")
            ) {
                throw failure;
            }
        }
        const parent = path.dirname(current);
        if (parent === current) {
            throw new Error(`No existing directory contains '${start}'`);
        }
        current = parent;
    }
}

function toWatchmanPath(targetPath: string): string {
    return targetPath.split(path.sep).join("/");
}
