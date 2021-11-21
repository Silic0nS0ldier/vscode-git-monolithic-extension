import AggregateError from 'aggregate-error';
import { OutputChannel, Uri, window } from 'vscode';
import { Model } from '../model.js';
import { Repository, Resource } from '../repository.js';
import { fromGitUri, isGitUri } from '../uri.js';
import { pathEquals } from '../util.js';

export async function runByRepository(
	model: Model,
	resources: Uri[],
	fn: (repository: Repository, resources: Uri[]) => Promise<void>,
): Promise<void> {
	const groups = resources.reduce((result, resource) => {
		let repository = model.getRepository(resource);

		if (!repository) {
			console.warn('Could not find git repository for ', resource);
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
	}, [] as { repository: Repository, resources: Uri[] }[]);

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
		throw new AggregateError(errors as any);
	}
}

export function getSCMResource(
	model: Model,
	outputChannel: OutputChannel,
	uri?: Uri,
): Resource | undefined {
	uri = uri ? uri : (window.activeTextEditor && window.activeTextEditor.document.uri);

	outputChannel.appendLine(`git.getSCMResource.uri ${uri && uri.toString()}`);

	for (const r of model.repositories.map(r => r.root)) {
		outputChannel.appendLine(`repo root ${r}`);
	}

	if (!uri) {
		return undefined;
	}

	if (isGitUri(uri)) {
		const { path } = fromGitUri(uri);
		uri = Uri.file(path);
	}

	if (uri.scheme === 'file') {
		const uriString = uri.toString();
		const repository = model.getRepository(uri);

		if (!repository) {
			return undefined;
		}

		return repository.workingTreeGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0]
			|| repository.indexGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0];
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
