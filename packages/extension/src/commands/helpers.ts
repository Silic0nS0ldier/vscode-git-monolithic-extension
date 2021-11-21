import AggregateError from 'aggregate-error';
import { Uri } from 'vscode';
import { Model } from '../model.js';
import { Repository } from '../repository.js';
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