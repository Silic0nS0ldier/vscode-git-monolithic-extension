/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
