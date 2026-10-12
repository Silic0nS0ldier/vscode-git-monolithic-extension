const __AbsolutePath = Symbol();
type AbsolutePath = string & { [__AbsolutePath]: never };
const __FileName = Symbol();
type FileName = string & { [__FileName]: never };

// TODO event types for pause due to high activity, etc
type FileEvent = {
    readonly path: AbsolutePath,
};

type IgnoreFnArgs = {
    // TODO This surface needs to report which files refer to directories
    //      as they often have special behaviours
};
type IgnoreFn = (args: IgnoreFnArgs) => Set<FileName>;

type Watcher = AsyncIterable<FileEvent[], undefined, FileEvent[]>
    & AsyncDisposable;

type WatcherOptions = {
    signal: AbortSignal,
    ignore?: IgnoreFn,
}

function createWatcher(opts: WatcherOptions): Promise<Watcher> {
    // TODO Perform file crawl, registering watches as we go.
    // 1. Watch file/directory (for dirs, make note of changes), it is important that this happens first.
    // 2. (dir only) Get directory contents and (for each) start step 1.
    // 3. (dir only) For each subdirectory, go to (1).
    // 4. When crawl complete, reconcile state with any observed changes during the watch.

    // TODO Handle watch paths that do not yet exist (watch the nearest parent)

    // TODO Native recursive watching
    //      Apparently macOS and Windows support this, surely so does Linux?

    // TODO Do not traverse into symlinks, but do report target path changes

    return {
        [Symbol.asyncDispose]: null,
        [Symbol.asyncIterator]: null,
    }
}
