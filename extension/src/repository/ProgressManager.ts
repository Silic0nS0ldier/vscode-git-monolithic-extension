import { ProgressLocation, Uri, window, workspace } from "vscode";
import * as config from "../util/config.js";
import { EmptyDisposable, type IDisposable } from "../util/disposals.js";
import { debounceEvent, eventToPromise, filterEvent, onceEvent } from "../util/events.js";
import type { AbstractRepository } from "./repository-class/AbstractRepository.js";

export class ProgressManager {
    #enabled = false;
    #disposable: IDisposable = EmptyDisposable;
    #repository: AbstractRepository;

    constructor(repository: AbstractRepository) {
        this.#repository = repository;
        const onDidChange = filterEvent(
            workspace.onDidChangeConfiguration,
            e => config.affected(e, Uri.file(this.#repository.root)),
        );
        onDidChange(_ => this.#updateEnablement());
        this.#updateEnablement();
    }

    #updateEnablement(): void {
        if (config.showProgress(Uri.file(this.#repository.root))) {
            this.#enable();
        } else {
            this.#disable();
        }
    }

    #enable(): void {
        if (this.#enabled) {
            return;
        }

        const start = onceEvent(
            filterEvent(this.#repository.onDidChangeOperations, () => this.#repository.operations.shouldShowProgress()),
        );
        const end = onceEvent(
            filterEvent(
                debounceEvent(this.#repository.onDidChangeOperations, 300),
                () => !this.#repository.operations.shouldShowProgress(),
            ),
        );

        const setup = (): void => {
            this.#disposable = start(() => {
                const promise = eventToPromise(end).then(() => setup());
                window.withProgress({ location: ProgressLocation.SourceControl }, () => promise);
            });
        };

        setup();
        this.#enabled = true;
    }

    #disable(): void {
        if (!this.#enabled) {
            return;
        }

        this.#disposable.dispose();
        this.#disposable = EmptyDisposable;
        this.#enabled = false;
    }

    dispose(): void {
        this.#disable();
    }
}
