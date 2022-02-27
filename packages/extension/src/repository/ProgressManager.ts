import { ProgressLocation, Uri, window, workspace } from "vscode";
import { debounceEvent, EmptyDisposable, eventToPromise, filterEvent, IDisposable, onceEvent } from "../util.js";
import { FinalRepository } from "./repository-class/mod.js";

export class ProgressManager {
    private enabled = false;
    private disposable: IDisposable = EmptyDisposable;

    constructor(private repository: FinalRepository) {
        const onDidChange = filterEvent(
            workspace.onDidChangeConfiguration,
            e => e.affectsConfiguration("git", Uri.file(this.repository.root)),
        );
        onDidChange(_ => this.updateEnablement());
        this.updateEnablement();
    }

    private updateEnablement(): void {
        const config = workspace.getConfiguration("git", Uri.file(this.repository.root));

        if (config.get<boolean>("showProgress")) {
            this.enable();
        } else {
            this.disable();
        }
    }

    private enable(): void {
        if (this.enabled) {
            return;
        }

        const start = onceEvent(
            filterEvent(this.repository.onDidChangeOperations, () => this.repository.operations.shouldShowProgress()),
        );
        const end = onceEvent(
            filterEvent(
                debounceEvent(this.repository.onDidChangeOperations, 300),
                () => !this.repository.operations.shouldShowProgress(),
            ),
        );

        const setup = () => {
            this.disposable = start(() => {
                const promise = eventToPromise(end).then(() => setup());
                window.withProgress({ location: ProgressLocation.SourceControl }, () => promise);
            });
        };

        setup();
        this.enabled = true;
    }

    private disable(): void {
        if (!this.enabled) {
            return;
        }

        this.disposable.dispose();
        this.disposable = EmptyDisposable;
        this.enabled = false;
    }

    dispose(): void {
        this.disable();
    }
}
