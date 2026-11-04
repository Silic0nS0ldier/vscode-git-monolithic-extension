import type { Event, Uri } from "vscode";
import { debug } from "../tracing.js";
import { combinedDisposable, EmptyDisposable, type IDisposable } from "../util/disposals.js";

export class FileEventLogger {
    #eventDisposable: IDisposable = EmptyDisposable;
    #logLevelDisposable: IDisposable = EmptyDisposable;
    #onWorkspaceWorkingTreeFileChange: Event<Uri>;
    #onDotGitFileChange: Event<Uri>;

    constructor(
        onWorkspaceWorkingTreeFileChange: Event<Uri>,
        onDotGitFileChange: Event<Uri>,
    ) {
        this.#onWorkspaceWorkingTreeFileChange = onWorkspaceWorkingTreeFileChange;
        this.#onDotGitFileChange = onDotGitFileChange;
        this.#onDidChangeLogLevel();
    }

    #onDidChangeLogLevel(): void {
        this.#eventDisposable.dispose();

        this.#eventDisposable = combinedDisposable([
            this.#onWorkspaceWorkingTreeFileChange(uri => debug(`[wt] Change: ${uri.fsPath}`)),
            this.#onDotGitFileChange(uri => debug(`[.git] Change: ${uri.fsPath}`)),
        ]);
    }

    dispose(): void {
        this.#eventDisposable.dispose();
        this.#logLevelDisposable.dispose();
    }
}
