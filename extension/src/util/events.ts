import type { Disposable, Event } from "vscode";
import { combinedDisposable } from "./disposals.js";

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
        let timer: NodeJS.Timeout;
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
