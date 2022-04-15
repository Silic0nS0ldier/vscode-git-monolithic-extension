/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createReadStream } from "node:fs";
import { EventEmitter } from "vscode";
import * as nls from "vscode-nls";
import { eventToPromise } from "./util/events.js";
import { toLineStream } from "./util/stream-by-line.js";

export function groupBy<T>(arr: T[], fn: (el: T) => string): { [key: string]: T[] } {
    return arr.reduce((result, el) => {
        const key = fn(el);
        result[key] = [...(result[key] || []), el];
        return result;
    }, Object.create(null));
}

export function find<T>(array: T[], fn: (t: T) => boolean): T | undefined {
    let result: T | undefined = undefined;

    array.some(e => {
        if (fn(e)) {
            result = e;
            return true;
        }

        return false;
    });

    return result;
}

export async function grep(filename: string, pattern: RegExp): Promise<boolean> {
    return new Promise<boolean>((c, e) => {
        const fileStream = createReadStream(filename, { encoding: "utf8" });
        const stream = toLineStream(fileStream, { encoding: "utf8" });
        stream.on("data", (line: string) => {
            if (pattern.test(line)) {
                fileStream.close();
                c(true);
            }
        });

        stream.on("error", e);
        stream.on("end", () => c(false));
    });
}

export function* splitInChunks(array: string[], maxChunkLength: number): IterableIterator<string[]> {
    let current: string[] = [];
    let length = 0;

    for (const value of array) {
        let newLength = length + value.length;

        if (newLength > maxChunkLength && current.length > 0) {
            yield current;
            current = [];
            newLength = value.length;
        }

        current.push(value);
        length = newLength;
    }

    if (current.length > 0) {
        yield current;
    }
}

interface ILimitedTaskFactory<T> {
    factory: () => Promise<T>;
    c: (value: T | Promise<T>) => void;
    e: (error?: any) => void;
}

export class Limiter<T> {
    #runningPromises: number;
    #maxDegreeOfParalellism: number;
    #outstandingPromises: ILimitedTaskFactory<T>[];

    constructor(maxDegreeOfParalellism: number) {
        this.#maxDegreeOfParalellism = maxDegreeOfParalellism;
        this.#outstandingPromises = [];
        this.#runningPromises = 0;
    }

    queue(factory: () => Promise<T>): Promise<T> {
        return new Promise<T>((c, e) => {
            this.#outstandingPromises.push({ c, e, factory });
            this.#consume();
        });
    }

    #consume(): void {
        while (this.#outstandingPromises.length && this.#runningPromises < this.#maxDegreeOfParalellism) {
            const iLimitedTask = this.#outstandingPromises.shift()!;
            this.#runningPromises++;

            const promise = iLimitedTask.factory();
            promise.then(iLimitedTask.c, iLimitedTask.e);
            promise.then(() => this.#consumed(), () => this.#consumed());
        }
    }

    #consumed(): void {
        this.#runningPromises--;

        if (this.#outstandingPromises.length > 0) {
            this.#consume();
        }
    }
}

type Completion<T> = { success: true; value: T } | { success: false; err: any };

export class PromiseSource<T> {
    #onDidCompleteEmitter = new EventEmitter<Completion<T>>();

    #promise: Promise<T> | undefined;
    get promise(): Promise<T> {
        if (this.#promise) {
            return this.#promise;
        }

        return eventToPromise(this.#onDidCompleteEmitter.event).then(completion => {
            if (completion.success) {
                return completion.value;
            } else {
                throw completion.err;
            }
        });
    }

    resolve(value: T): void {
        if (!this.#promise) {
            this.#promise = Promise.resolve(value);
            this.#onDidCompleteEmitter.fire({ success: true, value });
        }
    }

    reject(err: any): void {
        if (!this.#promise) {
            this.#promise = Promise.reject(err);
            this.#onDidCompleteEmitter.fire({ err, success: false });
        }
    }
}

export const localize = nls.loadMessageBundle();

export type Box<T> = {
    get(): T;
    set(value: T): void;
};

/**
 * Boxes a value so that it can be treated more like a pointer.
 * Handy for working towards pure-functional code incrementally.
 */
export function createBox<T>(initValue: T): Box<T> {
    let value = initValue;
    return {
        get() {
            return value;
        },
        set(newValue) {
            value = newValue;
        },
    };
}
