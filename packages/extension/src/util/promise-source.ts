import { EventEmitter } from "vscode";
import { eventToPromise } from "./events.js";

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
