/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, Disposable, OutputChannel, Uri, window, workspace, TextDocumentContentProvider } from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { Git } from './git.js';
import { Model } from './model.js';
import { Repository, Resource } from './repository.js';
import { fromGitUri, isGitUri } from './uri.js';
import { pathEquals } from './util.js';
import { registerCommands } from './commands/register.js';
import { createCommand } from './commands/create.js';
import AggregateError from 'aggregate-error';

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

	private items = new Map<string, string>();

	set(uri: Uri, contents: string): void {
		this.items.set(uri.path, contents);
	}

	delete(uri: Uri): void {
		this.items.delete(uri.path);
	}

	provideTextDocumentContent(uri: Uri): string | undefined {
		return this.items.get(uri.path);
	}
}

export function createCommands(
	git: Git,
	model: Model,
	outputChannel: OutputChannel,
	telemetryReporter: TelemetryReporter
): Disposable {
	const cmds = registerCommands(
		model,
		createRunByRepository(model),
		createGetSCMResource(outputChannel, model),
		git,
		outputChannel,
		telemetryReporter,
	);

	const commandErrors = new CommandErrorOutputTextDocumentContentProvider();

	const disposables = cmds.map(({ commandId, method, options }) => {
		const command = createCommand(
			model,
			telemetryReporter,
			outputChannel,
			commandErrors,
			commandId,
			method,
			options,
		);

		// if (options.diff) {
		// 	return commands.registerDiffInformationCommand(commandId, command);
		// } else {
		// 	return commands.registerCommand(commandId, command);
		// }
		return commands.registerCommand(commandId, command);
	});

	disposables.push(workspace.registerTextDocumentContentProvider('git-output', commandErrors));

	return Disposable.from(...disposables);
}

function createGetSCMResource(outputChannel: OutputChannel, model: Model): (uri?: Uri) => Resource | undefined {
	return function getSCMResource(uri) {
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
	};
}

function createRunByRepository(model: Model): RunByRepository {
	return async function runByRepository(resources, fn): Promise<void> {

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
			.map(({ repository, resources }) => fn(repository as Repository, resources));

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
	};
}

export type RunByRepository = (resources: Uri[], fn: (repository: Repository, resources: Uri[]) => Promise<void>) => Promise<void>;
