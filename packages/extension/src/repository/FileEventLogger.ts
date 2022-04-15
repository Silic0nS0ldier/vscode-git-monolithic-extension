import type { Event, OutputChannel, Uri } from "vscode";
import { Log, LogLevel, LogLevelOptions } from "../logging/log.js";
import { combinedDisposable, EmptyDisposable, IDisposable } from "../util/disposals.js";

export class FileEventLogger {
    #eventDisposable: IDisposable = EmptyDisposable;
    #logLevelDisposable: IDisposable = EmptyDisposable;
    #onWorkspaceWorkingTreeFileChange: Event<Uri>;
    #onDotGitFileChange: Event<Uri>;
    #outputChannel: OutputChannel;

    constructor(
        onWorkspaceWorkingTreeFileChange: Event<Uri>,
        onDotGitFileChange: Event<Uri>,
        outputChannel: OutputChannel,
    ) {
        this.#onWorkspaceWorkingTreeFileChange = onWorkspaceWorkingTreeFileChange;
        this.#onDotGitFileChange = onDotGitFileChange;
        this.#outputChannel = outputChannel;
        this.#logLevelDisposable = Log.onDidChangeLogLevel(this.#onDidChangeLogLevel, this);
        this.#onDidChangeLogLevel(Log.logLevel);
    }

    #onDidChangeLogLevel(level: LogLevelOptions): void {
        this.#eventDisposable.dispose();

        if (level > LogLevel.Debug) {
            return;
        }

        this.#eventDisposable = combinedDisposable([
            this.#onWorkspaceWorkingTreeFileChange(uri =>
                this.#outputChannel.appendLine(`[debug] [wt] Change: ${uri.fsPath}`)
            ),
            this.#onDotGitFileChange(uri => this.#outputChannel.appendLine(`[debug] [.git] Change: ${uri.fsPath}`)),
        ]);
    }

    dispose(): void {
        this.#eventDisposable.dispose();
        this.#logLevelDisposable.dispose();
    }
}
