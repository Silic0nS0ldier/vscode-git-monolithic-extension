import { Disposable, RelativePattern, Uri, workspace } from "vscode";
import type { WatchBackend, WatchBackendOptions, WatchEventType } from "./backend.js";

export function createVSCodeWatcher(options: WatchBackendOptions): WatchBackend {
    const watchers = options.targets.map(target => {
        const watcher = workspace.createFileSystemWatcher(
            new RelativePattern(Uri.file(target.path), target.recursive ? "**/*" : "*"),
        );
        const emit = (event: WatchEventType, uri: Uri): void => {
            options.onEvent({ event, path: uri.fsPath, watchable: true });
        };

        return Disposable.from(
            watcher,
            watcher.onDidCreate(uri => emit("add", uri)),
            watcher.onDidChange(uri => emit("change", uri)),
            watcher.onDidDelete(uri => emit("unlink", uri)),
        );
    });
    const disposable = Disposable.from(...watchers);

    return {
        dispose: (): void => {
            disposable.dispose();
        },
        ready: Promise.resolve(),
    };
}
