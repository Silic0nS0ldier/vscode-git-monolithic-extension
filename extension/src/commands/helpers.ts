import { type OutputChannel, type TextDocument, type TextDocumentContentProvider, Uri, window, workspace } from "vscode";
import type { Model } from "../model.js";
import type { AbstractRepository } from "../repository/repository-class/AbstractRepository.js";
import type { Resource } from "../repository/Resource.js";
import { fromGitUri, isGitUri } from "../uri.js";
import { isDescendant, pathEquals } from "../util/paths.js";

export async function runByRepository(
    model: Model,
    resources: Uri[],
    fn: (repository: AbstractRepository, resources: Uri[]) => Promise<void>,
): Promise<void> {
    const groups = resources.reduce((result, resource) => {
        let repository = model.getRepository(resource);

        if (!repository) {
            // TODO This won't go anywhere useful
            console.warn("Could not find git repository for ", resource);
            return result;
        }

        // Could it be a submodule?
        if (pathEquals(resource.fsPath, repository.root)) {
            repository = model.getRepositoryForSubmodule(resource) || repository;
        }

        const tuple = result.filter(p => p.repository === repository)[0];

        if (tuple) {
            tuple.resources.push(resource);
        } else {
            result.push({ repository, resources: [resource] });
        }

        return result;
    }, [] as { repository: AbstractRepository; resources: Uri[] }[]);

    const promises = groups
        .map(({ repository, resources }) => fn(repository, resources));

    const results = await Promise.allSettled(promises);

    const errors: unknown[] = [];
    for (const result of results) {
        if (result.status === "rejected") {
            errors.push(result.reason);
        }
    }

    if (errors.length > 0) {
        throw new AggregateError(errors);
    }
}

/**
 * Filters out falsy entries and, if the remaining list is empty or does not
 * start with a resource that has a proper `Uri` (e.g. when the command was
 * invoked from a keybinding rather than the SCM tree), falls back to the
 * SCM resource associated with the active text editor.
 */
export function normaliseResourceStates(
    model: Model,
    outputChannel: OutputChannel,
    resourceStates: readonly Resource[],
): Resource[] {
    const normalised = resourceStates.filter((s): s is Resource => !!s);

    if (
        normalised.length === 0
        || (normalised[0] && !(normalised[0].state.resourceUri instanceof Uri))
    ) {
        const resource = getSCMResource(model, outputChannel);

        if (!resource) {
            return [];
        }

        return [resource];
    }

    return normalised;
}

export function getSCMResource(
    model: Model,
    outputChannel: OutputChannel,
    uri?: Uri,
): Resource | undefined {
    let normalisedUri = uri ? uri : (window.activeTextEditor?.document.uri);

    outputChannel.appendLine(`git.getSCMResource.uri ${normalisedUri && normalisedUri.toString()}`);

    for (const r of model.repositories.map(r => r.root)) {
        outputChannel.appendLine(`repo root ${r}`);
    }

    if (!normalisedUri) {
        return undefined;
    }

    if (isGitUri(normalisedUri)) {
        const { path } = fromGitUri(normalisedUri);
        normalisedUri = Uri.file(path);
    }

    if (normalisedUri.scheme === "file") {
        const uriString = normalisedUri.toString();
        const repository = model.getRepository(normalisedUri);

        if (!repository) {
            return undefined;
        }

        return repository.sourceControlUI.trackedGroup.resourceStates.get().filter(r =>
            r.state.resourceUri.toString() === uriString
        )[0]
            || repository.sourceControlUI.stagedGroup.resourceStates.get().filter(r =>
                r.state.resourceUri.toString() === uriString
            )[0];
    }
    return undefined;
}

export interface ScmCommandOptions {
    repository?: boolean;
    diff?: boolean;
}

export interface ScmCommand {
    commandId: string;
    method: Function;
    options: ScmCommandOptions;
}

export class CommandErrorOutputTextDocumentContentProvider implements TextDocumentContentProvider {
    #items = new Map<string, string>();

    set(uri: Uri, contents: string): void {
        this.#items.set(uri.path, contents);
    }

    delete(uri: Uri): void {
        this.#items.delete(uri.path);
    }

    provideTextDocumentContent(uri: Uri): string | undefined {
        return this.#items.get(uri.path);
    }
}

export function makeCommandId(command: string): string {
    return "git_monolithic." + command;
}

/**
 * Collects the dirty text documents that belong to the given repository and
 * that the user would want to be prompted about before committing or
 * stashing.
 *
 * When the caller only cares about staged changes (either explicitly, or
 * because there already are staged changes in the repository), the returned
 * list is limited to documents matching a staged resource.
 */
export function getDocumentsToSaveBeforeChange(
    repository: AbstractRepository,
    promptSetting: "always" | "staged" | "never",
): TextDocument[] {
    let documents = workspace.textDocuments
        .filter(d => !d.isUntitled && d.isDirty && isDescendant(repository.root, d.uri.fsPath));

    if (
        promptSetting === "staged"
        || repository.sourceControlUI.stagedGroup.resourceStates.get().length > 0
    ) {
        documents = documents
            .filter(d =>
                repository.sourceControlUI.stagedGroup.resourceStates.get().some(s =>
                    pathEquals(s.state.resourceUri.fsPath, d.uri.fsPath)
                )
            );
    }

    return documents;
}
