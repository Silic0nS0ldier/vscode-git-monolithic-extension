/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'node:os';
import * as path from 'node:path';
import { commands, Disposable, OutputChannel, ProgressLocation, Uri, window, workspace, TextDocumentContentProvider } from 'vscode';
import TelemetryReporter from 'vscode-extension-telemetry';
import { Status, CommitOptions } from './api/git.js';
import { Git } from './git.js';
import { Model } from './model.js';
import { Repository, Resource } from './repository.js';
import { fromGitUri, isGitUri } from './uri.js';
import { isDescendant, localize, pathEquals } from './util.js';
import { pickRemoteSource } from './remoteSource.js';
import { registerCommands } from './commands/register.js';
import { syncCmdImpl } from './commands/implementations/sync/sync.js';
import { addRemoteCmdImpl } from './commands/implementations/remote/add-remote.js';
import { publishCmdImpl } from './commands/implementations/publish.js';
import { createCommand } from './commands/create.js';
import { push, PushType } from './commands/implementations/push/helpers.js';
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
		(url?: string, parentPath?: string, options: { recursive?: boolean } = {}) => cloneRepository(model, telemetryReporter, git, url, parentPath, options),
		(repository: Repository, opts?: CommitOptions) => commitWithAnyInput(repository, model, opts),
		(repository: Repository, noVerify?: boolean) => commitEmpty(repository, model, noVerify),
		git,
		outputChannel,
		(repository: Repository, rebase: boolean) => sync(repository, rebase, model),
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

// TODO Figure out how to move this into a different file (commands/clone most likely)
async function cloneRepository(
	model: Model,
	telemetryReporter: TelemetryReporter,
	git: Git,
	url?: string,
	parentPath?: string,
	options: { recursive?: boolean } = {},
): Promise<void> {
	if (!url || typeof url !== 'string') {
		url = await pickRemoteSource(model, {
			providerLabel: provider => localize('clonefrom', "Clone from {0}", provider.name),
			urlLabel: localize('repourl', "Clone from URL")
		});
	}

	if (!url) {
		/* __GDPR__
			"clone" : {
				"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_URL' });
		return;
	}

	url = url.trim().replace(/^git\s+clone\s+/, '');

	if (!parentPath) {
		const config = workspace.getConfiguration('git');
		let defaultCloneDirectory = config.get<string>('defaultCloneDirectory') || os.homedir();
		defaultCloneDirectory = defaultCloneDirectory.replace(/^~/, os.homedir());

		const uris = await window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			defaultUri: Uri.file(defaultCloneDirectory),
			openLabel: localize('selectFolder', "Select Repository Location")
		});

		if (!uris || uris.length === 0) {
			/* __GDPR__
				"clone" : {
					"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_directory' });
			return;
		}

		const uri = uris[0];
		parentPath = uri.fsPath;
	}

	try {
		const opts = {
			location: ProgressLocation.Notification,
			title: localize('cloning', "Cloning git repository '{0}'...", url),
			cancellable: true
		};

		const repositoryPath = await window.withProgress(
			opts,
			(progress, token) => git.clone(url!, { parentPath: parentPath!, progress, recursive: options.recursive }, token)
		);

		const config = workspace.getConfiguration('git');
		const openAfterClone = config.get<'always' | 'alwaysNewWindow' | 'whenNoFolderOpen' | 'prompt'>('openAfterClone');

		enum PostCloneAction { Open, OpenNewWindow, AddToWorkspace }
		let action: PostCloneAction | undefined = undefined;

		if (openAfterClone === 'always') {
			action = PostCloneAction.Open;
		} else if (openAfterClone === 'alwaysNewWindow') {
			action = PostCloneAction.OpenNewWindow;
		} else if (openAfterClone === 'whenNoFolderOpen' && !workspace.workspaceFolders) {
			action = PostCloneAction.Open;
		}

		if (action === undefined) {
			let message = localize('proposeopen', "Would you like to open the cloned repository?");
			const open = localize('openrepo', "Open");
			const openNewWindow = localize('openreponew', "Open in New Window");
			const choices = [open, openNewWindow];

			const addToWorkspace = localize('add', "Add to Workspace");
			if (workspace.workspaceFolders) {
				message = localize('proposeopen2', "Would you like to open the cloned repository, or add it to the current workspace?");
				choices.push(addToWorkspace);
			}

			const result = await window.showInformationMessage(message, ...choices);

			action = result === open ? PostCloneAction.Open
				: result === openNewWindow ? PostCloneAction.OpenNewWindow
					: result === addToWorkspace ? PostCloneAction.AddToWorkspace : undefined;
		}

		/* __GDPR__
			"clone" : {
				"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"openFolder": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true }
			}
		*/
		telemetryReporter.sendTelemetryEvent('clone', { outcome: 'success' }, { openFolder: action === PostCloneAction.Open || action === PostCloneAction.OpenNewWindow ? 1 : 0 });

		const uri = Uri.file(repositoryPath);

		if (action === PostCloneAction.Open) {
			commands.executeCommand('vscode.openFolder', uri, { forceReuseWindow: true });
		} else if (action === PostCloneAction.AddToWorkspace) {
			workspace.updateWorkspaceFolders(workspace.workspaceFolders!.length, 0, { uri });
		} else if (action === PostCloneAction.OpenNewWindow) {
			commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
		}
	} catch (err) {
		if (/already exists and is not an empty directory/.test(err && err.stderr || '')) {
			/* __GDPR__
				"clone" : {
					"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			telemetryReporter.sendTelemetryEvent('clone', { outcome: 'directory_not_empty' });
		} else if (/Cancelled/i.test(err && (err.message || err.stderr || ''))) {
			return;
		} else {
			/* __GDPR__
				"clone" : {
					"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			telemetryReporter.sendTelemetryEvent('clone', { outcome: 'error' });
		}

		throw err;
	}
}

// TODO Figure out how to move this into a different file (commands/commit most likely)
async function commitEmpty(
	repository: Repository,
	model: Model,
	noVerify?: boolean,
): Promise<void> {
	const root = Uri.file(repository.root);
	const config = workspace.getConfiguration('git', root);
	const shouldPrompt = config.get<boolean>('confirmEmptyCommits') === true;

	if (shouldPrompt) {
		const message = localize('confirm emtpy commit', "Are you sure you want to create an empty commit?");
		const yes = localize('yes', "Yes");
		const neverAgain = localize('yes never again', "Yes, Don't Show Again");
		const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

		if (pick === neverAgain) {
			await config.update('confirmEmptyCommits', false, true);
		} else if (pick !== yes) {
			return;
		}
	}

	await commitWithAnyInput(repository, model, { empty: true, noVerify });
}

// TODO Figure out how to move this into a different file (commands/commit most likely)
async function commitWithAnyInput(
	repository: Repository,
	model: Model,
	opts?: CommitOptions,
): Promise<void> {
	const message = repository.inputBox.value;
	const getCommitMessage = async () => {
		let _message: string | undefined = message;

		if (!_message) {
			let value: string | undefined = undefined;

			if (opts && opts.amend && repository.HEAD && repository.HEAD.commit) {
				return undefined;
			}

			const branchName = repository.headShortName;
			let placeHolder: string;

			if (branchName) {
				placeHolder = localize('commitMessageWithHeadLabel2', "Message (commit on '{0}')", branchName);
			} else {
				placeHolder = localize('commit message', "Commit message");
			}

			_message = await window.showInputBox({
				value,
				placeHolder,
				prompt: localize('provide commit message', "Please provide a commit message"),
				ignoreFocusOut: true
			});
		}

		return _message;
	};

	const didCommit = await smartCommit(repository, getCommitMessage, model, opts);

	if (message && didCommit) {
		repository.inputBox.value = await repository.getInputTemplate();
	}
}

// TODO Figure out how to move this into a different file (commands/commit most likely)
async function smartCommit(
	repository: Repository,
	getCommitMessage: () => Promise<string | undefined>,
	model: Model,
	opts?: CommitOptions
): Promise<boolean> {
	const config = workspace.getConfiguration('git', Uri.file(repository.root));
	let promptToSaveFilesBeforeCommit = config.get<'always' | 'staged' | 'never'>('promptToSaveFilesBeforeCommit');

	// migration
	if (promptToSaveFilesBeforeCommit as any === true) {
		promptToSaveFilesBeforeCommit = 'always';
	} else if (promptToSaveFilesBeforeCommit as any === false) {
		promptToSaveFilesBeforeCommit = 'never';
	}

	const enableSmartCommit = config.get<boolean>('enableSmartCommit') === true;
	const enableCommitSigning = config.get<boolean>('enableCommitSigning') === true;
	let noStagedChanges = repository.indexGroup.resourceStates.length === 0;
	let noUnstagedChanges = repository.workingTreeGroup.resourceStates.length === 0;

	if (promptToSaveFilesBeforeCommit !== 'never') {
		let documents = workspace.textDocuments
			.filter(d => !d.isUntitled && d.isDirty && isDescendant(repository.root, d.uri.fsPath));

		if (promptToSaveFilesBeforeCommit === 'staged' || repository.indexGroup.resourceStates.length > 0) {
			documents = documents
				.filter(d => repository.indexGroup.resourceStates.some(s => pathEquals(s.resourceUri.fsPath, d.uri.fsPath)));
		}

		if (documents.length > 0) {
			const message = documents.length === 1
				? localize('unsaved files single', "The following file has unsaved changes which won't be included in the commit if you proceed: {0}.\n\nWould you like to save it before committing?", path.basename(documents[0].uri.fsPath))
				: localize('unsaved files', "There are {0} unsaved files.\n\nWould you like to save them before committing?", documents.length);
			const saveAndCommit = localize('save and commit', "Save All & Commit");
			const commit = localize('commit', "Commit Staged Changes");
			const pick = await window.showWarningMessage(message, { modal: true }, saveAndCommit, commit);

			if (pick === saveAndCommit) {
				await Promise.all(documents.map(d => d.save()));
				await repository.add(documents.map(d => d.uri));

				noStagedChanges = repository.indexGroup.resourceStates.length === 0;
				noUnstagedChanges = repository.workingTreeGroup.resourceStates.length === 0;
			} else if (pick !== commit) {
				return false; // do not commit on cancel
			}
		}
	}

	if (!opts) {
		opts = { all: noStagedChanges };
	} else if (!opts.all && noStagedChanges && !opts.empty) {
		opts = { ...opts, all: true };
	}

	// no changes, and the user has not configured to commit all in this case
	if (!noUnstagedChanges && noStagedChanges && !enableSmartCommit && !opts.empty) {
		const suggestSmartCommit = config.get<boolean>('suggestSmartCommit') === true;

		if (!suggestSmartCommit) {
			return false;
		}

		// prompt the user if we want to commit all or not
		const message = localize('no staged changes', "There are no staged changes to commit.\n\nWould you like to stage all your changes and commit them directly?");
		const yes = localize('yes', "Yes");
		const always = localize('always', "Always");
		const never = localize('never', "Never");
		const pick = await window.showWarningMessage(message, { modal: true }, yes, always, never);

		if (pick === always) {
			config.update('enableSmartCommit', true, true);
		} else if (pick === never) {
			config.update('suggestSmartCommit', false, true);
			return false;
		} else if (pick !== yes) {
			return false; // do not commit on cancel
		}
	}

	// enable signing of commits if configured
	opts.signCommit = enableCommitSigning;

	if (config.get<boolean>('alwaysSignOff')) {
		opts.signoff = true;
	}

	const smartCommitChanges = config.get<'all' | 'tracked'>('smartCommitChanges');

	if (
		(
			// no changes
			(noStagedChanges && noUnstagedChanges)
			// or no staged changes and not `all`
			|| (!opts.all && noStagedChanges)
			// no staged changes and no tracked unstaged changes
			|| (noStagedChanges && smartCommitChanges === 'tracked' && repository.workingTreeGroup.resourceStates.every(r => r.type === Status.UNTRACKED))
		)
		// amend allows changing only the commit message
		&& !opts.amend
		&& !opts.empty
	) {
		const commitAnyway = localize('commit anyway', "Create Empty Commit");
		const answer = await window.showInformationMessage(localize('no changes', "There are no changes to commit."), commitAnyway);

		if (answer !== commitAnyway) {
			return false;
		}

		opts.empty = true;
	}

	if (opts.noVerify) {
		if (!config.get<boolean>('allowNoVerifyCommit')) {
			await window.showErrorMessage(localize('no verify commit not allowed', "Commits without verification are not allowed, please enable them with the 'git.allowNoVerifyCommit' setting."));
			return false;
		}

		if (config.get<boolean>('confirmNoVerifyCommit')) {
			const message = localize('confirm no verify commit', "You are about to commit your changes without verification, this skips pre-commit hooks and can be undesirable.\n\nAre you sure to continue?");
			const yes = localize('ok', "OK");
			const neverAgain = localize('never ask again', "OK, Don't Ask Again");
			const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

			if (pick === neverAgain) {
				config.update('confirmNoVerifyCommit', false, true);
			} else if (pick !== yes) {
				return false;
			}
		}
	}

	let message = await getCommitMessage();

	if (!message && !opts.amend) {
		return false;
	}

	if (opts.all && smartCommitChanges === 'tracked') {
		opts.all = 'tracked';
	}

	if (opts.all && config.get<'mixed' | 'separate' | 'hidden'>('untrackedChanges') !== 'mixed') {
		opts.all = 'tracked';
	}

	await repository.commit(message, opts);

	const postCommitCommand = config.get<'none' | 'push' | 'sync'>('postCommitCommand');

	switch (postCommitCommand) {
		case 'push':
			await push(repository, { pushType: PushType.Push, silent: true }, model);
			break;
		case 'sync':
			await syncCmdImpl(
				(repository: Repository, rebase: boolean) => sync(repository, rebase, model),
				repository,
			);
			break;
	}

	return true;
}

// TODO Figure out how to move this into a different file (commands/sync most likely)
async function sync(
	repository: Repository,
	rebase: boolean,
	model: Model,
): Promise<void> {
	const HEAD = repository.HEAD;

	if (!HEAD) {
		return;
	} else if (!HEAD.upstream) {
		const branchName = HEAD.name;
		const message = localize('confirm publish branch', "The branch '{0}' has no upstream branch. Would you like to publish this branch?", branchName);
		const yes = localize('ok', "OK");
		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick === yes) {
			await publishCmdImpl(
				model,
				addRemoteCmdImpl.bind(null, model),
				repository,
			);
		}
		return;
	}

	const remoteName = HEAD.remote || HEAD.upstream.remote;
	const remote = repository.remotes.find(r => r.name === remoteName);
	const isReadonly = remote && remote.isReadOnly;

	const config = workspace.getConfiguration('git');
	const shouldPrompt = !isReadonly && config.get<boolean>('confirmSync') === true;

	if (shouldPrompt) {
		const message = localize('sync is unpredictable', "This action will push and pull commits to and from '{0}/{1}'.", HEAD.upstream.remote, HEAD.upstream.name);
		const yes = localize('ok', "OK");
		const neverAgain = localize('never again', "OK, Don't Show Again");
		const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

		if (pick === neverAgain) {
			await config.update('confirmSync', false, true);
		} else if (pick !== yes) {
			return;
		}
	}

	if (rebase) {
		await repository.syncRebase(HEAD);
	} else {
		await repository.sync(HEAD);
	}
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
