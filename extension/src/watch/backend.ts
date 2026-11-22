export type WatchEventType =
    | "add"
    | "addDir"
    | "change"
    | "rename"
    | "renameDir"
    | "unlink"
    | "unlinkDir";

export type WatchEvent = {
    readonly event: WatchEventType;
    readonly path: string;
    readonly watchable: boolean;
};

export type WatchTarget = {
    readonly path: string;
    readonly recursive: boolean;
};

export type WatchBackendOptions = {
    readonly debounceMs: number;
    readonly id: string;
    readonly ignore: (path: string) => boolean;
    readonly onEvent: (event: WatchEvent) => void;
    readonly targets: readonly WatchTarget[];
};

export type WatchBackend = {
    readonly ready: Promise<void>;
    readonly dispose: () => void;
};
