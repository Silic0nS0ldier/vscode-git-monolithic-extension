/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'node:os';
import * as path from 'node:path';
import { commands, Disposable, MessageOptions, OutputChannel, Position, ProgressLocation, QuickPickItem, Range, TextEditor, Uri, window, workspace, WorkspaceEdit, TextDocumentContentProvider } from 'vscode';
import { LineChange } from "./interface-patches/vscode";
import TelemetryReporter from 'vscode-extension-telemetry';
import { ForcePushMode, GitErrorCodes, Ref, RefType, Status, CommitOptions } from './api/git.js';
import { Git, Stash } from './git.js';
import { Model } from './model.js';
import { Repository, Resource, ResourceGroupType } from './repository.js';
import { applyLineChanges } from './staging.js';
import { fromGitUri, toGitUri, isGitUri } from './uri.js';
import { grep, isDescendant, localize, pathEquals } from './util.js';
// import { GitTimelineItem } from './timelineProvider.js';
import { pickRemoteSource } from './remoteSource.js';
import { registerCommands } from './commands/mod';
import { syncCmdImpl } from './commands/sync';
import { cleanAllCmdImpl } from './commands/clean-all';
import { stashCmdImpl } from './commands/stash';
import { stashPopLatestCmdImpl } from './commands/stash-pop-latest';
import { addRemoteCmdImpl } from './commands/add-remote';
import { publishCmdImpl } from './commands/publish';

class CheckoutItem implements QuickPickItem {

	protected get shortCommit(): string { return (this.ref.commit || '').substr(0, 8); }
	get label(): string { return this.ref.name || this.shortCommit; }
	get description(): string { return this.shortCommit; }

	constructor(protected ref: Ref) { }

	async run(repository: Repository, opts?: { detached?: boolean }): Promise<void> {
		const ref = this.ref.name;

		if (!ref) {
			return;
		}

		await repository.checkout(ref, opts);
	}
}

class CheckoutTagItem extends CheckoutItem {

	override get description(): string {
		return localize('tag at', "Tag at {0}", this.shortCommit);
	}
}

class CheckoutRemoteHeadItem extends CheckoutItem {

	override get description(): string {
		return localize('remote branch at', "Remote branch at {0}", this.shortCommit);
	}

	override async run(repository: Repository, opts?: { detached?: boolean }): Promise<void> {
		if (!this.ref.name) {
			return;
		}

		const branches = await repository.findTrackingBranches(this.ref.name);

		if (branches.length > 0) {
			await repository.checkout(branches[0].name!, opts);
		} else {
			await repository.checkoutTracking(this.ref.name, opts);
		}
	}
}

export class BranchDeleteItem implements QuickPickItem {

	private get shortCommit(): string { return (this.ref.commit || '').substr(0, 8); }
	get branchName(): string | undefined { return this.ref.name; }
	get label(): string { return this.branchName || ''; }
	get description(): string { return this.shortCommit; }

	constructor(private ref: Ref) { }

	async run(repository: Repository, force?: boolean): Promise<void> {
		if (!this.branchName) {
			return;
		}
		await repository.deleteBranch(this.branchName, force);
	}
}

export class MergeItem implements QuickPickItem {

	get label(): string { return this.ref.name || ''; }
	get description(): string { return this.ref.name || ''; }

	constructor(protected ref: Ref) { }

	async run(repository: Repository): Promise<void> {
		await repository.merge(this.ref.name! || this.ref.commit!);
	}
}

export class RebaseItem implements QuickPickItem {

	get label(): string { return this.ref.name || ''; }
	description: string = '';

	constructor(readonly ref: Ref) { }

	async run(repository: Repository): Promise<void> {
		if (this.ref?.name) {
			await repository.rebase(this.ref.name);
		}
	}
}

class CreateBranchItem implements QuickPickItem {
	get label(): string { return '$(plus) ' + localize('create branch', 'Create new branch...'); }
	get description(): string { return ''; }
	get alwaysShow(): boolean { return true; }
}

class CreateBranchFromItem implements QuickPickItem {
	get label(): string { return '$(plus) ' + localize('create branch from', 'Create new branch from...'); }
	get description(): string { return ''; }
	get alwaysShow(): boolean { return true; }
}

class CheckoutDetachedItem implements QuickPickItem {
	get label(): string { return '$(debug-disconnect) ' + localize('checkout detached', 'Checkout detached...'); }
	get description(): string { return ''; }
	get alwaysShow(): boolean { return true; }
}

class HEADItem implements QuickPickItem {

	constructor(private repository: Repository) { }

	get label(): string { return 'HEAD'; }
	get description(): string { return (this.repository.HEAD && this.repository.HEAD.commit || '').substr(0, 8); }
	get alwaysShow(): boolean { return true; }
}

export class AddRemoteItem implements QuickPickItem {

	constructor(private addRemote: (repository: Repository) => Promise<string|void>) { }

	get label(): string { return '$(plus) ' + localize('add remote', 'Add a new remote...'); }
	get description(): string { return ''; }

	get alwaysShow(): boolean { return true; }

	async run(repository: Repository): Promise<void> {
		await this.addRemote(repository);
	}
}

interface ScmCommandOptions {
	repository?: boolean;
	diff?: boolean;
}

export interface ScmCommand {
	commandId: string;
	key: string;
	method: Function;
	options: ScmCommandOptions;
}

// const ImageMimetypes = [
// 	'image/png',
// 	'image/gif',
// 	'image/jpeg',
// 	'image/webp',
// 	'image/tiff',
// 	'image/bmp'
// ];

export async function categorizeResourceByResolution(resources: Resource[]): Promise<{ merge: Resource[], resolved: Resource[], unresolved: Resource[], deletionConflicts: Resource[] }> {
	const selection = resources.filter(s => s instanceof Resource) as Resource[];
	const merge = selection.filter(s => s.resourceGroupType === ResourceGroupType.Merge);
	const isBothAddedOrModified = (s: Resource) => s.type === Status.BOTH_MODIFIED || s.type === Status.BOTH_ADDED;
	const isAnyDeleted = (s: Resource) => s.type === Status.DELETED_BY_THEM || s.type === Status.DELETED_BY_US;
	const possibleUnresolved = merge.filter(isBothAddedOrModified);
	const promises = possibleUnresolved.map(s => grep(s.resourceUri.fsPath, /^<{7}|^={7}|^>{7}/));
	const unresolvedBothModified = await Promise.all<boolean>(promises);
	const resolved = possibleUnresolved.filter((_s, i) => !unresolvedBothModified[i]);
	const deletionConflicts = merge.filter(s => isAnyDeleted(s));
	const unresolved = [
		...merge.filter(s => !isBothAddedOrModified(s) && !isAnyDeleted(s)),
		...possibleUnresolved.filter((_s, i) => unresolvedBothModified[i])
	];

	return { merge, resolved, unresolved, deletionConflicts };
}

function createCheckoutItems(repository: Repository): CheckoutItem[] {
	const config = workspace.getConfiguration('git');
	const checkoutTypeConfig = config.get<string | string[]>('checkoutType');
	let checkoutTypes: string[];

	if (checkoutTypeConfig === 'all' || !checkoutTypeConfig || checkoutTypeConfig.length === 0) {
		checkoutTypes = ['local', 'remote', 'tags'];
	} else if (typeof checkoutTypeConfig === 'string') {
		checkoutTypes = [checkoutTypeConfig];
	} else {
		checkoutTypes = checkoutTypeConfig;
	}

	const processors = checkoutTypes.map(getCheckoutProcessor)
		.filter(p => !!p) as CheckoutProcessor[];

	for (const ref of repository.refs) {
		for (const processor of processors) {
			processor.onRef(ref);
		}
	}

	return processors.reduce<CheckoutItem[]>((r, p) => r.concat(...p.items), []);
}

class CheckoutProcessor {

	private refs: Ref[] = [];
	get items(): CheckoutItem[] { return this.refs.map(r => new this.ctor(r)); }
	constructor(private type: RefType, private ctor: { new(ref: Ref): CheckoutItem }) { }

	onRef(ref: Ref): void {
		if (ref.type === this.type) {
			this.refs.push(ref);
		}
	}
}

function getCheckoutProcessor(type: string): CheckoutProcessor | undefined {
	switch (type) {
		case 'local':
			return new CheckoutProcessor(RefType.Head, CheckoutItem);
		case 'remote':
			return new CheckoutProcessor(RefType.RemoteHead, CheckoutRemoteHeadItem);
		case 'tags':
			return new CheckoutProcessor(RefType.Tag, CheckoutTagItem);
	}

	return undefined;
}

export function sanitizeRemoteName(name: string) {
	name = name.trim();
	return name && name.replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g, '-');
}

export class TagItem implements QuickPickItem {
	get label(): string { return this.ref.name ?? ''; }
	get description(): string { return this.ref.commit?.substr(0, 8) ?? ''; }
	constructor(readonly ref: Ref) { }
}

export enum PushType {
	Push,
	PushTo,
	PushFollowTags,
	PushTags
}

export interface PushOptions {
	pushType: PushType;
	forcePush?: boolean;
	silent?: boolean;

	pushTo?: {
		remote?: string;
		refspec?: string;
		setUpstream?: boolean;
	}
}

class CommandErrorOutputTextDocumentContentProvider implements TextDocumentContentProvider {

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

export class CommandCenter {

	private disposables: Disposable[];
	private commandErrors = new CommandErrorOutputTextDocumentContentProvider();

	constructor(
		private git: Git,
		private model: Model,
		private outputChannel: OutputChannel,
		private telemetryReporter: TelemetryReporter
	) {
		const cmds = registerCommands(
			this.model,
			this._branch.bind(this),
			this._checkout.bind(this),
			this._cleanTrackedChanges.bind(this),
			this._cleanUntrackedChange.bind(this),
			this._cleanUntrackedChanges.bind(this),
			this.runByRepository.bind(this),
			this.getSCMResource.bind(this),
			this.cloneRepository.bind(this),
			this.commitWithAnyInput.bind(this),
			this._commitEmpty.bind(this),
			this.git,
			this._push.bind(this),
			this.promptForBranchName.bind(this),
			this._revertChanges.bind(this),
			this.outputChannel,
			this._stageDeletionConflict.bind(this),
			this.pickStash.bind(this),
			this._stash.bind(this),
			this._sync.bind(this),
			this._stageChanges.bind(this),
		);
		this.disposables = cmds.map(({ commandId, key, method, options }) => {
			const command = this.createCommand(commandId, key, method, options);

			// if (options.diff) {
			// 	return commands.registerDiffInformationCommand(commandId, command);
			// } else {
			// 	return commands.registerCommand(commandId, command);
			// }
			return commands.registerCommand(commandId, command);
		});

		this.disposables.push(workspace.registerTextDocumentContentProvider('git-output', this.commandErrors));
	}

	async cloneRepository(url?: string, parentPath?: string, options: { recursive?: boolean } = {}): Promise<void> {
		if (!url || typeof url !== 'string') {
			url = await pickRemoteSource(this.model, {
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
			this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_URL' });
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
				this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'no_directory' });
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
				(progress, token) => this.git.clone(url!, { parentPath: parentPath!, progress, recursive: options.recursive }, token)
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
			this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'success' }, { openFolder: action === PostCloneAction.Open || action === PostCloneAction.OpenNewWindow ? 1 : 0 });

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
				this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'directory_not_empty' });
			} else if (/Cancelled/i.test(err && (err.message || err.stderr || ''))) {
				return;
			} else {
				/* __GDPR__
					"clone" : {
						"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryReporter.sendTelemetryEvent('clone', { outcome: 'error' });
			}

			throw err;
		}
	}

	private async _stageDeletionConflict(repository: Repository, uri: Uri): Promise<void> {
		const uriString = uri.toString();
		const resource = repository.mergeGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0];

		if (!resource) {
			return;
		}

		if (resource.type === Status.DELETED_BY_THEM) {
			const keepIt = localize('keep ours', "Keep Our Version");
			const deleteIt = localize('delete', "Delete File");
			const result = await window.showInformationMessage(localize('deleted by them', "File '{0}' was deleted by them and modified by us.\n\nWhat would you like to do?", path.basename(uri.fsPath)), { modal: true }, keepIt, deleteIt);

			if (result === keepIt) {
				await repository.add([uri]);
			} else if (result === deleteIt) {
				await repository.rm([uri]);
			} else {
				throw new Error('Cancelled');
			}
		} else if (resource.type === Status.DELETED_BY_US) {
			const keepIt = localize('keep theirs', "Keep Their Version");
			const deleteIt = localize('delete', "Delete File");
			const result = await window.showInformationMessage(localize('deleted by us', "File '{0}' was deleted by us and modified by them.\n\nWhat would you like to do?", path.basename(uri.fsPath)), { modal: true }, keepIt, deleteIt);

			if (result === keepIt) {
				await repository.add([uri]);
			} else if (result === deleteIt) {
				await repository.rm([uri]);
			} else {
				throw new Error('Cancelled');
			}
		}
	}

	private async _stageChanges(textEditor: TextEditor, changes: LineChange[]): Promise<void> {
		const modifiedDocument = textEditor.document;
		const modifiedUri = modifiedDocument.uri;

		if (modifiedUri.scheme !== 'file') {
			return;
		}

		const originalUri = toGitUri(modifiedUri, '~');
		const originalDocument = await workspace.openTextDocument(originalUri);
		const result = applyLineChanges(originalDocument, modifiedDocument, changes);

		await this.runByRepository(
			[modifiedUri],
			async (repository, resources) => {
				for (const resource of resources) {
					await repository.stage(resource, result);
				}
			});
	}

	private async _revertChanges(textEditor: TextEditor, changes: LineChange[]): Promise<void> {
		const modifiedDocument = textEditor.document;
		const modifiedUri = modifiedDocument.uri;

		if (modifiedUri.scheme !== 'file') {
			return;
		}

		const originalUri = toGitUri(modifiedUri, '~');
		const originalDocument = await workspace.openTextDocument(originalUri);
		const visibleRangesBeforeRevert = textEditor.visibleRanges;
		const result = applyLineChanges(originalDocument, modifiedDocument, changes);

		const edit = new WorkspaceEdit();
		edit.replace(modifiedUri, new Range(new Position(0, 0), modifiedDocument.lineAt(modifiedDocument.lineCount - 1).range.end), result);
		workspace.applyEdit(edit);

		await modifiedDocument.save();

		textEditor.revealRange(visibleRangesBeforeRevert[0]);
	}

	private async _cleanTrackedChanges(repository: Repository, resources: Resource[]): Promise<void> {
		const message = resources.length === 1
			? localize('confirm discard all single', "Are you sure you want to discard changes in {0}?", path.basename(resources[0].resourceUri.fsPath))
			: localize('confirm discard all', "Are you sure you want to discard ALL changes in {0} files?\nThis is IRREVERSIBLE!\nYour current working set will be FOREVER LOST if you proceed.", resources.length);
		const yes = resources.length === 1
			? localize('discardAll multiple', "Discard 1 File")
			: localize('discardAll', "Discard All {0} Files", resources.length);
		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick !== yes) {
			return;
		}

		await repository.clean(resources.map(r => r.resourceUri));
	}

	private async _cleanUntrackedChange(repository: Repository, resource: Resource): Promise<void> {
		const message = localize('confirm delete', "Are you sure you want to DELETE {0}?\nThis is IRREVERSIBLE!\nThis file will be FOREVER LOST if you proceed.", path.basename(resource.resourceUri.fsPath));
		const yes = localize('delete file', "Delete file");
		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick !== yes) {
			return;
		}

		await repository.clean([resource.resourceUri]);
	}

	private async _cleanUntrackedChanges(repository: Repository, resources: Resource[]): Promise<void> {
		const message = localize('confirm delete multiple', "Are you sure you want to DELETE {0} files?\nThis is IRREVERSIBLE!\nThese files will be FOREVER LOST if you proceed.", resources.length);
		const yes = localize('delete files', "Delete Files");
		const pick = await window.showWarningMessage(message, { modal: true }, yes);

		if (pick !== yes) {
			return;
		}

		await repository.clean(resources.map(r => r.resourceUri));
	}

	private async smartCommit(
		repository: Repository,
		getCommitMessage: () => Promise<string | undefined>,
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
				await this._push(repository, { pushType: PushType.Push, silent: true });
				break;
			case 'sync':
				await syncCmdImpl(this._sync.bind(this), repository);
				break;
		}

		return true;
	}

	private async commitWithAnyInput(repository: Repository, opts?: CommitOptions): Promise<void> {
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

		const didCommit = await this.smartCommit(repository, getCommitMessage, opts);

		if (message && didCommit) {
			repository.inputBox.value = await repository.getInputTemplate();
		}
	}

	private async _commitEmpty(repository: Repository, noVerify?: boolean): Promise<void> {
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

		await this.commitWithAnyInput(repository, { empty: true, noVerify });
	}

	private async _checkout(repository: Repository, opts?: { detached?: boolean, treeish?: string }): Promise<boolean> {
		if (typeof opts?.treeish === 'string') {
			await repository.checkout(opts?.treeish, opts);
			return true;
		}

		const createBranch = new CreateBranchItem();
		const createBranchFrom = new CreateBranchFromItem();
		const checkoutDetached = new CheckoutDetachedItem();
		const picks: QuickPickItem[] = [];

		if (!opts?.detached) {
			picks.push(createBranch, createBranchFrom, checkoutDetached);
		}

		picks.push(...createCheckoutItems(repository));

		const quickpick = window.createQuickPick();
		quickpick.items = picks;
		quickpick.placeholder = opts?.detached
			? localize('select a ref to checkout detached', 'Select a ref to checkout in detached mode')
			: localize('select a ref to checkout', 'Select a ref to checkout');

		quickpick.show();

		const choice = await new Promise<QuickPickItem | undefined>(c => quickpick.onDidAccept(() => c(quickpick.activeItems[0])));
		quickpick.hide();

		if (!choice) {
			return false;
		}

		if (choice === createBranch) {
			await this._branch(repository, quickpick.value);
		} else if (choice === createBranchFrom) {
			await this._branch(repository, quickpick.value, true);
		} else if (choice === checkoutDetached) {
			return this._checkout(repository, { detached: true });
		} else {
			const item = choice as CheckoutItem;

			try {
				await item.run(repository, opts);
			} catch (err) {
				if (err.gitErrorCode !== GitErrorCodes.DirtyWorkTree) {
					throw err;
				}

				const force = localize('force', "Force Checkout");
				const stash = localize('stashcheckout', "Stash & Checkout");
				const choice = await window.showWarningMessage(localize('local changes', "Your local changes would be overwritten by checkout."), { modal: true }, force, stash);

				if (choice === force) {
					await cleanAllCmdImpl(
						this._cleanTrackedChanges.bind(this),
						this._cleanUntrackedChange.bind(this),
						this._cleanUntrackedChanges.bind(this),
						repository,
					);
					await item.run(repository, opts);
				} else if (choice === stash) {
					await stashCmdImpl(this._stash.bind(this), repository);
					await item.run(repository, opts);
					await stashPopLatestCmdImpl(repository);
				}
			}
		}

		return true;
	}

	private async promptForBranchName(defaultName?: string, initialValue?: string): Promise<string> {
		const config = workspace.getConfiguration('git');
		const branchWhitespaceChar = config.get<string>('branchWhitespaceChar')!;
		const branchValidationRegex = config.get<string>('branchValidationRegex')!;
		const sanitize = (name: string) => name ?
			name.trim().replace(/^-+/, '').replace(/^\.|\/\.|\.\.|~|\^|:|\/$|\.lock$|\.lock\/|\\|\*|\s|^\s*$|\.$|\[|\]$/g, branchWhitespaceChar)
			: name;

		const rawBranchName = defaultName || await window.showInputBox({
			placeHolder: localize('branch name', "Branch name"),
			prompt: localize('provide branch name', "Please provide a new branch name"),
			value: initialValue,
			ignoreFocusOut: true,
			validateInput: (name: string) => {
				const validateName = new RegExp(branchValidationRegex);
				if (validateName.test(sanitize(name))) {
					return null;
				}

				return localize('branch name format invalid', "Branch name needs to match regex: {0}", branchValidationRegex);
			}
		});

		return sanitize(rawBranchName || '');
	}

	private async _branch(repository: Repository, defaultName?: string, from = false): Promise<void> {
		const branchName = await this.promptForBranchName(defaultName);

		if (!branchName) {
			return;
		}

		let target = 'HEAD';

		if (from) {
			const picks = [new HEADItem(repository), ...createCheckoutItems(repository)];
			const placeHolder = localize('select a ref to create a new branch from', 'Select a ref to create the \'{0}\' branch from', branchName);
			const choice = await window.showQuickPick(picks, { placeHolder });

			if (!choice) {
				return;
			}

			target = choice.label;
		}

		await repository.branch(branchName, true, target);
	}

	private async _push(repository: Repository, pushOptions: PushOptions) {
		const remotes = repository.remotes;

		if (remotes.length === 0) {
			if (pushOptions.silent) {
				return;
			}

			const addRemote = localize('addremote', 'Add Remote');
			const result = await window.showWarningMessage(localize('no remotes to push', "Your repository has no remotes configured to push to."), addRemote);

			if (result === addRemote) {
				await addRemoteCmdImpl(this.model, repository);
			}

			return;
		}

		const config = workspace.getConfiguration('git', Uri.file(repository.root));
		let forcePushMode: ForcePushMode | undefined = undefined;

		if (pushOptions.forcePush) {
			if (!config.get<boolean>('allowForcePush')) {
				await window.showErrorMessage(localize('force push not allowed', "Force push is not allowed, please enable it with the 'git.allowForcePush' setting."));
				return;
			}

			forcePushMode = config.get<boolean>('useForcePushWithLease') === true ? ForcePushMode.ForceWithLease : ForcePushMode.Force;

			if (config.get<boolean>('confirmForcePush')) {
				const message = localize('confirm force push', "You are about to force push your changes, this can be destructive and could inadvertently overwrite changes made by others.\n\nAre you sure to continue?");
				const yes = localize('ok', "OK");
				const neverAgain = localize('never ask again', "OK, Don't Ask Again");
				const pick = await window.showWarningMessage(message, { modal: true }, yes, neverAgain);

				if (pick === neverAgain) {
					config.update('confirmForcePush', false, true);
				} else if (pick !== yes) {
					return;
				}
			}
		}

		if (pushOptions.pushType === PushType.PushFollowTags) {
			await repository.pushFollowTags(undefined, forcePushMode);
			return;
		}

		if (pushOptions.pushType === PushType.PushTags) {
			await repository.pushTags(undefined, forcePushMode);
		}

		if (!repository.HEAD || !repository.HEAD.name) {
			if (!pushOptions.silent) {
				window.showWarningMessage(localize('nobranch', "Please check out a branch to push to a remote."));
			}
			return;
		}

		if (pushOptions.pushType === PushType.Push) {
			try {
				await repository.push(repository.HEAD, forcePushMode);
			} catch (err) {
				if (err.gitErrorCode !== GitErrorCodes.NoUpstreamBranch) {
					throw err;
				}

				if (pushOptions.silent) {
					return;
				}

				const branchName = repository.HEAD.name;
				const message = localize('confirm publish branch', "The branch '{0}' has no upstream branch. Would you like to publish this branch?", branchName);
				const yes = localize('ok', "OK");
				const pick = await window.showWarningMessage(message, { modal: true }, yes);

				if (pick === yes) {
					await publishCmdImpl(
						this.model,
						addRemoteCmdImpl.bind(null, this.model),
						repository,
					);
				}
			}
		} else {
			const branchName = repository.HEAD.name;
			if (!pushOptions.pushTo?.remote) {
				const addRemote = new AddRemoteItem(addRemoteCmdImpl.bind(null, this.model));
				const picks = [...remotes.filter(r => r.pushUrl !== undefined).map(r => ({ label: r.name, description: r.pushUrl })), addRemote];
				const placeHolder = localize('pick remote', "Pick a remote to publish the branch '{0}' to:", branchName);
				const choice = await window.showQuickPick(picks, { placeHolder });

				if (!choice) {
					return;
				}

				if (choice === addRemote) {
					const newRemote = await addRemoteCmdImpl(this.model, repository);

					if (newRemote) {
						await repository.pushTo(newRemote, branchName, undefined, forcePushMode);
					}
				} else {
					await repository.pushTo(choice.label, branchName, undefined, forcePushMode);
				}
			} else {
				await repository.pushTo(pushOptions.pushTo.remote, pushOptions.pushTo.refspec || branchName, pushOptions.pushTo.setUpstream, forcePushMode);
			}
		}
	}

	private async _sync(repository: Repository, rebase: boolean): Promise<void> {
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
					this.model,
					addRemoteCmdImpl.bind(null, this.model),
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

	private async _stash(repository: Repository, includeUntracked = false): Promise<void> {
		const noUnstagedChanges = repository.workingTreeGroup.resourceStates.length === 0
			&& (!includeUntracked || repository.untrackedGroup.resourceStates.length === 0);
		const noStagedChanges = repository.indexGroup.resourceStates.length === 0;

		if (noUnstagedChanges && noStagedChanges) {
			window.showInformationMessage(localize('no changes stash', "There are no changes to stash."));
			return;
		}

		const config = workspace.getConfiguration('git', Uri.file(repository.root));
		const promptToSaveFilesBeforeStashing = config.get<'always' | 'staged' | 'never'>('promptToSaveFilesBeforeStash');

		if (promptToSaveFilesBeforeStashing !== 'never') {
			let documents = workspace.textDocuments
				.filter(d => !d.isUntitled && d.isDirty && isDescendant(repository.root, d.uri.fsPath));

			if (promptToSaveFilesBeforeStashing === 'staged' || repository.indexGroup.resourceStates.length > 0) {
				documents = documents
					.filter(d => repository.indexGroup.resourceStates.some(s => pathEquals(s.resourceUri.fsPath, d.uri.fsPath)));
			}

			if (documents.length > 0) {
				const message = documents.length === 1
					? localize('unsaved stash files single', "The following file has unsaved changes which won't be included in the stash if you proceed: {0}.\n\nWould you like to save it before stashing?", path.basename(documents[0].uri.fsPath))
					: localize('unsaved stash files', "There are {0} unsaved files.\n\nWould you like to save them before stashing?", documents.length);
				const saveAndStash = localize('save and stash', "Save All & Stash");
				const stash = localize('stash', "Stash Anyway");
				const pick = await window.showWarningMessage(message, { modal: true }, saveAndStash, stash);

				if (pick === saveAndStash) {
					await Promise.all(documents.map(d => d.save()));
				} else if (pick !== stash) {
					return; // do not stash on cancel
				}
			}
		}

		let message: string | undefined;

		if (config.get<boolean>('useCommitInputAsStashMessage') && (!repository.sourceControl.commitTemplate || repository.inputBox.value !== repository.sourceControl.commitTemplate)) {
			message = repository.inputBox.value;
		}

		message = await window.showInputBox({
			value: message,
			prompt: localize('provide stash message', "Optionally provide a stash message"),
			placeHolder: localize('stash message', "Stash message")
		});

		if (typeof message === 'undefined') {
			return;
		}

		await repository.createStash(message, includeUntracked);
	}

	private async pickStash(repository: Repository, placeHolder: string): Promise<Stash | undefined> {
		const stashes = await repository.getStashes();

		if (stashes.length === 0) {
			window.showInformationMessage(localize('no stashes', "There are no stashes in the repository."));
			return;
		}

		const picks = stashes.map(stash => ({ label: `#${stash.index}:  ${stash.description}`, description: '', details: '', stash }));
		const result = await window.showQuickPick(picks, { placeHolder });
		return result && result.stash;
	}

	// resolveTimelineOpenDiffCommand(item: TimelineItem, uri: Uri | undefined, options?: TextDocumentShowOptions): Command | undefined {
	// 	if (uri === undefined || uri === null || !GitTimelineItem.is(item)) {
	// 		return undefined;
	// 	}

	// 	const basename = path.basename(uri.fsPath);

	// 	let title;
	// 	if ((item.previousRef === 'HEAD' || item.previousRef === '~') && item.ref === '') {
	// 		title = localize('git.title.workingTree', '{0} (Working Tree)', basename);
	// 	}
	// 	else if (item.previousRef === 'HEAD' && item.ref === '~') {
	// 		title = localize('git.title.index', '{0} (Index)', basename);
	// 	} else {
	// 		title = localize('git.title.diffRefs', '{0} ({1}) ⟷ {0} ({2})', basename, item.shortPreviousRef, item.shortRef);
	// 	}

	// 	return {
	// 		command: 'vscode.diff',
	// 		title: 'Open Comparison',
	// 		arguments: [toGitUri(uri, item.previousRef), item.ref === '' ? uri : toGitUri(uri, item.ref), title, options]
	// 	};
	// }

	// private _selectedForCompare: { uri: Uri, item: GitTimelineItem } | undefined;

	private createCommand(id: string, key: string, method: Function, options: ScmCommandOptions): (...args: any[]) => any {
		const result = (...args: any[]) => {
			let result: Promise<any>;

			if (!options.repository) {
				result = Promise.resolve(method.apply(this, args));
			} else {
				// try to guess the repository based on the first argument
				const repository = this.model.getRepository(args[0]);
				let repositoryPromise: Promise<Repository | undefined>;

				if (repository) {
					repositoryPromise = Promise.resolve(repository);
				} else if (this.model.repositories.length === 1) {
					repositoryPromise = Promise.resolve(this.model.repositories[0]);
				} else {
					repositoryPromise = this.model.pickRepository();
				}

				result = repositoryPromise.then(repository => {
					if (!repository) {
						return Promise.resolve();
					}

					return Promise.resolve(method.apply(this, [repository, ...args.slice(1)]));
				});
			}

			/* __GDPR__
				"git.command" : {
					"command" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
			this.telemetryReporter.sendTelemetryEvent('git.command', { command: id });

			return result.catch(async err => {
				const options: MessageOptions = {
					modal: true
				};

				let message: string;
				let type: 'error' | 'warning' = 'error';

				const choices = new Map<string, () => void>();
				const openOutputChannelChoice = localize('open git log', "Open Git Log");
				const outputChannel = this.outputChannel as OutputChannel;
				choices.set(openOutputChannelChoice, () => outputChannel.show());

				const showCommandOutputChoice = localize('show command output', "Show Command Output");
				if (err.stderr) {
					choices.set(showCommandOutputChoice, async () => {
						const timestamp = new Date().getTime();
						const uri = Uri.parse(`git-output:/git-error-${timestamp}`);

						let command = 'git';

						if (err.gitArgs) {
							command = `${command} ${err.gitArgs.join(' ')}`;
						} else if (err.gitCommand) {
							command = `${command} ${err.gitCommand}`;
						}

						this.commandErrors.set(uri, `> ${command}\n${err.stderr}`);

						try {
							const doc = await workspace.openTextDocument(uri);
							await window.showTextDocument(doc);
						} finally {
							this.commandErrors.delete(uri);
						}
					});
				}

				switch (err.gitErrorCode) {
					case GitErrorCodes.DirtyWorkTree:
						message = localize('clean repo', "Please clean your repository working tree before checkout.");
						break;
					case GitErrorCodes.PushRejected:
						message = localize('cant push', "Can't push refs to remote. Try running 'Pull' first to integrate your changes.");
						break;
					case GitErrorCodes.Conflict:
						message = localize('merge conflicts', "There are merge conflicts. Resolve them before committing.");
						type = 'warning';
						options.modal = false;
						break;
					case GitErrorCodes.StashConflict:
						message = localize('stash merge conflicts', "There were merge conflicts while applying the stash.");
						type = 'warning';
						options.modal = false;
						break;
					case GitErrorCodes.AuthenticationFailed:
						const regex = /Authentication failed for '(.*)'/i;
						const match = regex.exec(err.stderr || String(err));

						message = match
							? localize('auth failed specific', "Failed to authenticate to git remote:\n\n{0}", match[1])
							: localize('auth failed', "Failed to authenticate to git remote.");
						break;
					case GitErrorCodes.NoUserNameConfigured:
					case GitErrorCodes.NoUserEmailConfigured:
						message = localize('missing user info', "Make sure you configure your 'user.name' and 'user.email' in git.");
						choices.set(localize('learn more', "Learn More"), () => commands.executeCommand('vscode.open', Uri.parse('https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup')));
						break;
					default:
						const hint = (err.stderr || err.message || String(err))
							.replace(/^error: /mi, '')
							.replace(/^> husky.*$/mi, '')
							.split(/[\r\n]/)
							.filter((line: string) => !!line)
						[0];

						message = hint
							? localize('git error details', "Git: {0}", hint)
							: localize('git error', "Git error");

						break;
				}

				if (!message) {
					console.error(err);
					return;
				}

				const allChoices = Array.from(choices.keys());
				const result = type === 'error'
					? await window.showErrorMessage(message, options, ...allChoices)
					: await window.showWarningMessage(message, options, ...allChoices);

				if (result) {
					const resultFn = choices.get(result);

					if (resultFn) {
						resultFn();
					}
				}
			});
		};

		// patch this object, so people can call methods directly
		(this as any)[key] = result;

		return result;
	}

	private getSCMResource(uri?: Uri): Resource | undefined {
		uri = uri ? uri : (window.activeTextEditor && window.activeTextEditor.document.uri);

		this.outputChannel.appendLine(`git.getSCMResource.uri ${uri && uri.toString()}`);

		for (const r of this.model.repositories.map(r => r.root)) {
			this.outputChannel.appendLine(`repo root ${r}`);
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
			const repository = this.model.getRepository(uri);

			if (!repository) {
				return undefined;
			}

			return repository.workingTreeGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0]
				|| repository.indexGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString)[0];
		}
		return undefined;
	}

	private async runByRepository<T>(arg: Uri | Uri[], fn: (repository: Repository, resources: any) => Promise<T>): Promise<T[]> {
		const resources = arg instanceof Uri ? [arg] : arg;
		const isSingleResource = arg instanceof Uri;

		const groups = resources.reduce((result, resource) => {
			let repository = this.model.getRepository(resource);

			if (!repository) {
				console.warn('Could not find git repository for ', resource);
				return result;
			}

			// Could it be a submodule?
			if (pathEquals(resource.fsPath, repository.root)) {
				repository = this.model.getRepositoryForSubmodule(resource) || repository;
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
			.map(({ repository, resources }) => fn(repository as Repository, isSingleResource ? resources[0] : resources));

		return Promise.all(promises);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

export type RunByRepository<T> = (resources: Uri[], fn: (repository: Repository, resources: Uri[]) => Promise<T>) => Promise<T[]>;
