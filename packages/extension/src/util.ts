/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createReadStream } from "node:fs";
import { sep } from "node:path";
import type { Readable } from "node:stream";
import { Disposable, Event, EventEmitter } from "vscode";
import * as nls from "vscode-nls";
import { toLineStream } from "./util/stream-by-line.js";

export interface IDisposable {
    dispose(): void;
}

export function dispose<T extends IDisposable>(disposables: T[]): T[] {
    disposables.forEach(d => d.dispose());
    return [];
}

export function toDisposable(dispose: () => void): IDisposable {
    return { dispose };
}

export function combinedDisposable(disposables: IDisposable[]): IDisposable {
    return toDisposable(() => dispose(disposables));
}

export const EmptyDisposable = toDisposable(() => null);

export function fireEvent<T>(event: Event<T>): Event<T> {
    return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) =>
        event(_ => (listener as any).call(thisArgs), null, disposables);
}

export function mapEvent<I, O>(event: Event<I>, map: (i: I) => O): Event<O> {
    return (listener: (e: O) => any, thisArgs?: any, disposables?: Disposable[]) =>
        event(i => listener.call(thisArgs, map(i)), null, disposables);
}

export function filterEvent<T>(event: Event<T>, filter: (e: T) => boolean): Event<T> {
    return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) =>
        event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}

export function anyEvent<T>(...events: Event<T>[]): Event<T> {
    return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => {
        const result = combinedDisposable(events.map(event => event(i => listener.call(thisArgs, i))));

        if (disposables) {
            disposables.push(result);
        }

        return result;
    };
}

export function done<T>(promise: Promise<T>): Promise<void> {
    return promise.then<void>(() => undefined);
}

export function onceEvent<T>(event: Event<T>): Event<T> {
    return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => {
        const result = event(
            e => {
                result.dispose();
                return listener.call(thisArgs, e);
            },
            null,
            disposables,
        );

        return result;
    };
}

export function debounceEvent<T>(event: Event<T>, delay: number): Event<T> {
    return (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => {
        let timer: NodeJS.Timer;
        return event(
            e => {
                clearTimeout(timer);
                timer = setTimeout(() => listener.call(thisArgs, e), delay);
            },
            null,
            disposables,
        );
    };
}

export function eventToPromise<T>(event: Event<T>): Promise<T> {
    return new Promise<T>(c => onceEvent(event)(c));
}

export function once(fn: (...args: any[]) => any): (...args: any[]) => any {
    let didRun = false;

    return (...args) => {
        if (didRun) {
            return;
        }

        return fn(...args);
    };
}

export function assign<T>(destination: T, ...sources: any[]): T {
    for (const source of sources) {
        Object.keys(source).forEach(key => (destination as any)[key] = source[key]);
    }

    return destination;
}

export function uniqBy<T>(arr: T[], fn: (el: T) => string): T[] {
    const seen = Object.create(null);

    return arr.filter(el => {
        const key = fn(el);

        if (seen[key]) {
            return false;
        }

        seen[key] = true;
        return true;
    });
}

export function groupBy<T>(arr: T[], fn: (el: T) => string): { [key: string]: T[] } {
    return arr.reduce((result, el) => {
        const key = fn(el);
        result[key] = [...(result[key] || []), el];
        return result;
    }, Object.create(null));
}

export function uniqueFilter<T>(keyFn: (t: T) => string): (t: T) => boolean {
    const seen: { [key: string]: boolean } = Object.create(null);

    return element => {
        const key = keyFn(element);

        if (seen[key]) {
            return false;
        }

        seen[key] = true;
        return true;
    };
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

export function readBytes(stream: Readable, bytes: number): Promise<Buffer> {
    return new Promise<Buffer>((complete, error) => {
        let done = false;
        let buffer = Buffer.allocUnsafe(bytes);
        let bytesRead = 0;

        stream.on("data", (data: Buffer) => {
            let bytesToRead = Math.min(bytes - bytesRead, data.length);
            data.copy(buffer, bytesRead, 0, bytesToRead);
            bytesRead += bytesToRead;

            if (bytesRead === bytes) {
                (stream as any).destroy(); // Will trigger the close event eventually
            }
        });

        stream.on("error", (e: Error) => {
            if (!done) {
                done = true;
                error(e);
            }
        });

        stream.on("close", () => {
            if (!done) {
                done = true;
                complete(buffer.slice(0, bytesRead));
            }
        });
    });
}

type EncodingOptions = "utf8" | "utf16be" | "utf16le";
const Encoding: Record<EncodingOptions, EncodingOptions> = {
    utf16be: "utf16be",
    utf16le: "utf16le",
    utf8: "utf8",
};

export function detectUnicodeEncoding(buffer: Buffer): EncodingOptions | null {
    if (buffer.length < 2) {
        return null;
    }

    const b0 = buffer.readUInt8(0);
    const b1 = buffer.readUInt8(1);

    if (b0 === 0xFE && b1 === 0xFF) {
        return Encoding.utf16be;
    }

    if (b0 === 0xFF && b1 === 0xFE) {
        return Encoding.utf16le;
    }

    if (buffer.length < 3) {
        return null;
    }

    const b2 = buffer.readUInt8(2);

    if (b0 === 0xEF && b1 === 0xBB && b2 === 0xBF) {
        return Encoding.utf8;
    }

    return null;
}

function isWindowsPath(path: string): boolean {
    return /^[a-zA-Z]:\\/.test(path);
}

export function isDescendant(parent: string, descendant: string): boolean {
    let normalisedParent = parent;
    let normalisedDescendant = descendant;
    if (normalisedParent === normalisedDescendant) {
        return true;
    }

    if (normalisedParent.charAt(normalisedParent.length - 1) !== sep) {
        normalisedParent += sep;
    }

    // Windows is case insensitive
    if (isWindowsPath(normalisedParent)) {
        normalisedParent = normalisedParent.toLowerCase();
        normalisedDescendant = normalisedDescendant.toLowerCase();
    }

    return normalisedDescendant.startsWith(normalisedParent);
}

// TODO This is an oversimplification, sensitivity depends on the disk
export function pathEquals(a: string, b: string): boolean {
    let normalisedA = a;
    let normalisedB = b;
    // Windows is case insensitive
    if (isWindowsPath(normalisedA)) {
        normalisedA = normalisedA.toLowerCase();
        normalisedB = normalisedB.toLowerCase();
    }

    return normalisedA === normalisedB;
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
