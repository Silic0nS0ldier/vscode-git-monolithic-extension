import type { Event, OutputChannel, Uri } from "vscode";
import { Log, LogLevel, LogLevelOptions } from "../logging/log.js";
import { combinedDisposable, EmptyDisposable, IDisposable } from "../util.js";

export class FileEventLogger {
    private eventDisposable: IDisposable = EmptyDisposable;
    private logLevelDisposable: IDisposable = EmptyDisposable;

    constructor(
        private onWorkspaceWorkingTreeFileChange: Event<Uri>,
        private onDotGitFileChange: Event<Uri>,
        private outputChannel: OutputChannel,
    ) {
        this.logLevelDisposable = Log.onDidChangeLogLevel(this.onDidChangeLogLevel, this);
        this.onDidChangeLogLevel(Log.logLevel);
    }

    private onDidChangeLogLevel(level: LogLevelOptions): void {
        this.eventDisposable.dispose();

        if (level > LogLevel.Debug) {
            return;
        }

        this.eventDisposable = combinedDisposable([
            this.onWorkspaceWorkingTreeFileChange(uri =>
                this.outputChannel.appendLine(`[debug] [wt] Change: ${uri.fsPath}`)
            ),
            this.onDotGitFileChange(uri => this.outputChannel.appendLine(`[debug] [.git] Change: ${uri.fsPath}`)),
        ]);
    }

    dispose(): void {
        this.eventDisposable.dispose();
        this.logLevelDisposable.dispose();
    }
}
