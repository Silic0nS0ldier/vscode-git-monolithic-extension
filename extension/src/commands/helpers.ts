import { type OutputChannel, type TextDocumentContentProvider, Uri, window } from "vscode";
import type { Model } from "../model.js";
import type { AbstractRepository } from "../repository/repository-class/AbstractRepository.js";
import type { Resource } from "../repository/Resource.js";
import { fromGitUri, isGitUri } from "../uri.js";
import { pathEquals } from "../util/paths.js";

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
