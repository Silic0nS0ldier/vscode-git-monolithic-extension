/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import * as path from "node:path";
import onetime from "onetime";
import {
    commands,
    Disposable,
    Event,
    EventEmitter,
    Memento,
    OutputChannel,
    QuickPickItem,
    SourceControl,
    SourceControlResourceGroup,
    TextEditor,
    Uri,
    window,
    workspace,
    WorkspaceFoldersChangeEvent,
} from "vscode";
import { ApiRepository } from "./api/api1.js";
import {
    APIState as State,
    CredentialsProvider,
    PublishEvent,
    PushErrorHandler,
    RemoteSourceProvider,
} from "./api/git.js";
import { Askpass } from "./askpass.js";
import { Git } from "./git.js";
import { prettyPrint } from "./logging/pretty-print.js";
import { debounce } from "./package-patches/just-debounce.js";
import { throat } from "./package-patches/throat.js";
import { IPushErrorHandlerRegistry } from "./pushError.js";
import { IRemoteSourceProviderRegistry } from "./remoteProvider.js";
import { createRepository, FinalRepository, isFinalRepository } from "./repository/repository-class/mod.js";
import { RepositoryState } from "./repository/RepositoryState.js";
import { fromGitUri } from "./uri.js";
import {
    anyEvent,
    dispose,
    eventToPromise,
    filterEvent,
    isDescendant,
    localize,
    pathEquals,
    toDisposable,
} from "./util.js";

class RepositoryPick implements QuickPickItem {
    get label(): string {
        return this._label();
    }

    private _label = onetime(() => path.basename(this.repository.root));

    get description(): string {
        return this._description();
    }

    private _description = onetime(() => {
        return [this.repository.headLabel, this.repository.syncLabel]
            .filter(l => !!l)
            .join(" ");
    });

    constructor(public readonly repository: FinalRepository, public readonly index: number) {}
}

export interface ModelChangeEvent {
    repository: FinalRepository;
    uri: Uri;
}

export interface OriginalResourceChangeEvent {
    repository: FinalRepository;
    uri: Uri;
}

interface OpenRepository extends Disposable {
    repository: FinalRepository;
}

export class Model implements IRemoteSourceProviderRegistry, IPushErrorHandlerRegistry {
    private _onDidOpenRepository = new EventEmitter<FinalRepository>();
    readonly onDidOpenRepository: Event<FinalRepository> = this._onDidOpenRepository.event;

    private _onDidCloseRepository = new EventEmitter<FinalRepository>();
    readonly onDidCloseRepository: Event<FinalRepository> = this._onDidCloseRepository.event;

    private _onDidChangeRepository = new EventEmitter<ModelChangeEvent>();
    readonly onDidChangeRepository: Event<ModelChangeEvent> = this._onDidChangeRepository.event;

    private _onDidChangeOriginalResource = new EventEmitter<OriginalResourceChangeEvent>();
    readonly onDidChangeOriginalResource: Event<OriginalResourceChangeEvent> = this._onDidChangeOriginalResource.event;

    private openRepositories: OpenRepository[] = [];
    get repositories(): FinalRepository[] {
        return this.openRepositories.map(r => r.repository);
    }

    private possibleGitRepositoryPaths = new Set<string>();

    private _onDidChangeState = new EventEmitter<State>();
    readonly onDidChangeState = this._onDidChangeState.event;

    private _onDidPublish = new EventEmitter<PublishEvent>();
    readonly onDidPublish = this._onDidPublish.event;

    firePublishEvent(repository: FinalRepository, branch?: string) {
        this._onDidPublish.fire({ branch: branch, repository: new ApiRepository(repository) });
    }

    private _state: State = "uninitialized";
    get state(): State {
        return this._state;
    }

    setState(state: State): void {
        this._state = state;
        this._onDidChangeState.fire(state);
        commands.executeCommand("setContext", "git.state", state);
    }

    isInitialized = onetime(async () => {
        if (this._state === "initialized") {
            return Promise.resolve();
        }

        await eventToPromise(filterEvent(this.onDidChangeState, s => s === "initialized"));
    });

    private remoteSourceProviders = new Set<RemoteSourceProvider>();

    private _onDidAddRemoteSourceProvider = new EventEmitter<RemoteSourceProvider>();
    readonly onDidAddRemoteSourceProvider = this._onDidAddRemoteSourceProvider.event;

    private _onDidRemoveRemoteSourceProvider = new EventEmitter<RemoteSourceProvider>();
    readonly onDidRemoveRemoteSourceProvider = this._onDidRemoveRemoteSourceProvider.event;

    private pushErrorHandlers = new Set<PushErrorHandler>();

    private disposables: Disposable[] = [];

    constructor(
        readonly git: Git,
        private readonly askpass: Askpass,
        private globalState: Memento,
        private outputChannel: OutputChannel,
    ) {
        workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspaceFolders, this, this.disposables);
        window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors, this, this.disposables);
        workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this, this.disposables);

        // Watchers are responsible for identifying deletion and addition of repositories (main and worktrees)
        const gitMainTreeWatcher = workspace.createFileSystemWatcher("**/.git/HEAD", false, true, false);
        const gitWorkTreeWatcher = workspace.createFileSystemWatcher("**/.git", false, true, false);
        this.disposables.push(gitMainTreeWatcher, gitWorkTreeWatcher);
        const onGitIndexEvent = anyEvent(
            gitMainTreeWatcher.onDidCreate,
            gitMainTreeWatcher.onDidDelete,
            gitWorkTreeWatcher.onDidCreate,
            gitWorkTreeWatcher.onDidDelete,
        );
        onGitIndexEvent(this.onPossibleGitRepositoryChange, this, this.disposables);

        this.setState("uninitialized");
        this.doInitialScan().finally(() => this.setState("initialized"));
    }

    private async doInitialScan(): Promise<void> {
        await Promise.all([
            this.onDidChangeWorkspaceFolders({ added: workspace.workspaceFolders || [], removed: [] }),
            this.onDidChangeVisibleTextEditors(window.visibleTextEditors),
            this.scanWorkspaceFolders(),
        ]);
    }

    /**
     * Scans the first level of each workspace folder, looking
     * for git repositories.
     */
    private async scanWorkspaceFolders(): Promise<void> {
        const config = workspace.getConfiguration("git");
        const autoRepositoryDetection = config.get<boolean | "subFolders" | "openEditors">("autoRepositoryDetection");

        if (autoRepositoryDetection !== true && autoRepositoryDetection !== "subFolders") {
            return;
        }

        await Promise.all((workspace.workspaceFolders || []).map(async folder => {
            const root = folder.uri.fsPath;
            const children = await new Promise<string[]>((c, e) => fs.readdir(root, (err, r) => err ? e(err) : c(r)));
            const subfolders = new Set(children.filter(child => child !== ".git").map(child => path.join(root, child)));

            const scanPaths = (workspace.isTrusted
                ? workspace.getConfiguration("git", folder.uri)
                : config).get<string[]>("scanRepositories") || [];
            for (const scanPath of scanPaths) {
                if (scanPath !== ".git") {
                    continue;
                }

                if (path.isAbsolute(scanPath)) {
                    console.warn(
                        localize("not supported", "Absolute paths not supported in 'git.scanRepositories' setting."),
                    );
                    continue;
                }

                subfolders.add(path.join(root, scanPath));
            }

            await Promise.all([...subfolders].map(f => this.openRepository(f)));
        }));
    }

    private onPossibleGitRepositoryChange(uri: Uri): void {
        // TODO Handle repository removal
        // Only process new repositories
        if (this.getRepository(uri)) {
            return;
        }

        const config = workspace.getConfiguration("git");
        const autoRepositoryDetection = config.get<boolean | "subFolders" | "openEditors">("autoRepositoryDetection");

        if (autoRepositoryDetection === false) {
            return;
        }

        this.eventuallyScanPossibleGitRepository(uri.fsPath.replace(/\.git.*$/, ""));
    }

    private eventuallyScanPossibleGitRepository(path: string) {
        this.possibleGitRepositoryPaths.add(path);
        this.eventuallyScanPossibleGitRepositories();
    }

    private eventuallyScanPossibleGitRepositories = debounce(() => {
        for (const path of this.possibleGitRepositoryPaths) {
            this.openRepository(path);
        }

        this.possibleGitRepositoryPaths.clear();
    }, 500);

    private async onDidChangeWorkspaceFolders({ added, removed }: WorkspaceFoldersChangeEvent): Promise<void> {
        const possibleRepositoryFolders = added
            .filter(folder => !this.getOpenRepository(folder.uri));

        const activeRepositoriesList = window.visibleTextEditors
            .map(editor => this.getRepository(editor.document.uri))
            .filter(repository => !!repository) as FinalRepository[];

        const activeRepositories = new Set<FinalRepository>(activeRepositoriesList);
        const openRepositoriesToDispose = removed
            .map(folder => this.getOpenRepository(folder.uri))
            .filter(r => !!r)
            .filter(r => !activeRepositories.has(r!.repository))
            .filter(r =>
                !(workspace.workspaceFolders || []).some(f => isDescendant(f.uri.fsPath, r!.repository.root))
            ) as OpenRepository[];

        openRepositoriesToDispose.forEach(r => r.dispose());
        await Promise.all(possibleRepositoryFolders.map(p => this.openRepository(p.uri.fsPath)));
    }

    private onDidChangeConfiguration(): void {
        const possibleRepositoryFolders = (workspace.workspaceFolders || [])
            .filter(folder => workspace.getConfiguration("git", folder.uri).get<boolean>("enabled") === true)
            .filter(folder => !this.getOpenRepository(folder.uri));

        const openRepositoriesToDispose = this.openRepositories
            .map(repository => ({ repository, root: Uri.file(repository.repository.root) }))
            .filter(({ root }) => workspace.getConfiguration("git", root).get<boolean>("enabled") !== true)
            .map(({ repository }) => repository);

        possibleRepositoryFolders.forEach(p => this.openRepository(p.uri.fsPath));
        openRepositoriesToDispose.forEach(r => r.dispose());
    }

    private async onDidChangeVisibleTextEditors(editors: readonly TextEditor[]): Promise<void> {
        if (!workspace.isTrusted) {
            return;
        }

        const config = workspace.getConfiguration("git");
        const autoRepositoryDetection = config.get<boolean | "subFolders" | "openEditors">("autoRepositoryDetection");

        if (autoRepositoryDetection !== true && autoRepositoryDetection !== "openEditors") {
            return;
        }

        await Promise.all(editors.map(async editor => {
            const uri = editor.document.uri;

            if (uri.scheme !== "file") {
                return;
            }

            const repository = this.getRepository(uri);

            if (repository) {
                return;
            }

            await this.openRepository(path.dirname(uri.fsPath));
        }));
    }

    openRepository = throat(1, async (repoPath: string) => {
        if (this.getRepository(repoPath)) {
            return;
        }

        const config = workspace.getConfiguration("git", Uri.file(repoPath));
        const enabled = config.get<boolean>("enabled") === true;

        if (!enabled) {
            return;
        }

        if (!workspace.isTrusted) {
            // Check if the folder is a bare repo: if it has a file named HEAD && `rev-parse --show -cdup` is empty
            try {
                fs.accessSync(path.join(repoPath, "HEAD"), fs.constants.F_OK);
                const result = await this.git.exec(repoPath, ["-C", repoPath, "rev-parse", "--show-cdup"]);
                if (result.stderr.trim() === "" && result.stdout.trim() === "") {
                    return;
                }
            } catch {
                // If this throw, we should be good to open the repo (e.g. HEAD doesn't exist)
            }
        }

        try {
            const rawRoot = await this.git.getRepositoryRoot(repoPath);

            // This can happen whenever `path` has the wrong case sensitivity in
            // case insensitive file systems
            // https://github.com/microsoft/vscode/issues/33498
            const repositoryRoot = Uri.file(rawRoot).fsPath;

            if (this.getRepository(repositoryRoot)) {
                return;
            }

            if (shouldRepositoryBeIgnored(rawRoot)) {
                return;
            }

            const dotGit = await this.git.getRepositoryDotGit(repositoryRoot);
            const repository = createRepository(
                this.git.open(repositoryRoot, dotGit),
                this,
                this,
                this.globalState,
                this.outputChannel,
            );

            this.open(repository);
            await repository.status();
        } catch (ex) {
            // noop
            this.outputChannel.appendLine(
                `Opening repository for path='${repoPath}' failed; ex=${await prettyPrint(ex)}`,
            );
        }
    });

    private open(repository: FinalRepository): void {
        this.outputChannel.appendLine(`Open repository: ${repository.root}`);

        const onDidDisappearRepository = filterEvent(
            repository.onDidChangeState,
            state => state === RepositoryState.Disposed,
        );
        const disappearListener = onDidDisappearRepository(() => dispose());
        const changeListener = repository.onDidChangeRepository(uri =>
            this._onDidChangeRepository.fire({ repository, uri })
        );
        const originalResourceChangeListener = repository.onDidChangeOriginalResource(uri =>
            this._onDidChangeOriginalResource.fire({ repository, uri })
        );

        const shouldDetectSubmodules = workspace
            .getConfiguration("git", Uri.file(repository.root))
            .get<boolean>("detectSubmodules") as boolean;

        const submodulesLimit = workspace
            .getConfiguration("git", Uri.file(repository.root))
            .get<number>("detectSubmodulesLimit") as number;

        const checkForSubmodules = () => {
            if (!shouldDetectSubmodules) {
                return;
            }

            if (repository.submodules.length > submodulesLimit) {
                window.showWarningMessage(
                    localize(
                        "too many submodules",
                        "The '{0}' repository has {1} submodules which won't be opened automatically. You can still open each one individually by opening a file within.",
                        path.basename(repository.root),
                        repository.submodules.length,
                    ),
                );
                statusListener.dispose();
            }

            repository.submodules
                .slice(0, submodulesLimit)
                .map(r => path.join(repository.root, r.path))
                .forEach(p => this.eventuallyScanPossibleGitRepository(p));
        };

        const statusListener = repository.onDidRunGitStatus(checkForSubmodules);
        checkForSubmodules();

        const dispose = () => {
            disappearListener.dispose();
            changeListener.dispose();
            originalResourceChangeListener.dispose();
            statusListener.dispose();
            repository.dispose();

            this.openRepositories = this.openRepositories.filter(e => e !== openRepository);
            this._onDidCloseRepository.fire(repository);
        };

        const openRepository = { dispose, repository };
        this.openRepositories.push(openRepository);
        this._onDidOpenRepository.fire(repository);
    }

    close(repository: FinalRepository): void {
        const openRepository = this.getOpenRepository(repository);

        if (!openRepository) {
            return;
        }

        this.outputChannel.appendLine(`Close repository: ${repository.root}`);
        openRepository.dispose();
    }

    async pickRepository(): Promise<FinalRepository | undefined> {
        if (this.openRepositories.length === 0) {
            throw new Error(localize("no repositories", "There are no available repositories"));
        }

        const picks = this.openRepositories.map((e, index) => new RepositoryPick(e.repository, index));
        const active = window.activeTextEditor;
        const repository = active && this.getRepository(active.document.fileName);
        const index = picks.findIndex(pick => pick.repository === repository);

        // Move repository pick containing the active text editor to appear first
        if (index > -1) {
            picks.unshift(...picks.splice(index, 1));
        }

        const placeHolder = localize("pick repo", "Choose a repository");
        const pick = await window.showQuickPick(picks, { placeHolder });

        return pick && pick.repository;
    }

    getRepository(sourceControl: SourceControl): FinalRepository | undefined;
    getRepository(resourceGroup: SourceControlResourceGroup): FinalRepository | undefined;
    getRepository(path: string): FinalRepository | undefined;
    getRepository(resource: Uri): FinalRepository | undefined;
    getRepository(hint: any): FinalRepository | undefined {
        const liveRepository = this.getOpenRepository(hint);
        return liveRepository && liveRepository.repository;
    }

    private getOpenRepository(repository: FinalRepository): OpenRepository | undefined;
    private getOpenRepository(sourceControl: SourceControl): OpenRepository | undefined;
    private getOpenRepository(resourceGroup: SourceControlResourceGroup): OpenRepository | undefined;
    private getOpenRepository(path: string): OpenRepository | undefined;
    private getOpenRepository(resource: Uri): OpenRepository | undefined;
    private getOpenRepository(hint: any): OpenRepository | undefined {
        let normalisedHint = hint;
        if (!normalisedHint) {
            return undefined;
        }

        if (isFinalRepository(normalisedHint)) {
            const stableHint = normalisedHint;
            return this.openRepositories.filter(r => r.repository === stableHint)[0];
        }

        if (typeof normalisedHint === "string") {
            normalisedHint = Uri.file(normalisedHint);
        }

        if (normalisedHint instanceof Uri) {
            let resourcePath: string;

            if (normalisedHint.scheme === "git") {
                resourcePath = fromGitUri(normalisedHint).path;
            } else {
                resourcePath = normalisedHint.fsPath;
            }

            outer:
            for (
                const liveRepository of this.openRepositories.sort((a, b) =>
                    b.repository.root.length - a.repository.root.length
                )
            ) {
                if (!isDescendant(liveRepository.repository.root, resourcePath)) {
                    continue;
                }

                for (const submodule of liveRepository.repository.submodules) {
                    const submoduleRoot = path.join(liveRepository.repository.root, submodule.path);

                    if (isDescendant(submoduleRoot, resourcePath)) {
                        continue outer;
                    }
                }

                return liveRepository;
            }

            return undefined;
        }

        for (const liveRepository of this.openRepositories) {
            const repository = liveRepository.repository;

            if (normalisedHint === repository.sourceControl) {
                return liveRepository;
            }

            if (
                normalisedHint === repository.mergeGroup || normalisedHint === repository.indexGroup
                || normalisedHint === repository.workingTreeGroup
            ) {
                return liveRepository;
            }
        }

        return undefined;
    }

    getRepositoryForSubmodule(submoduleUri: Uri): FinalRepository | undefined {
        for (const repository of this.repositories) {
            for (const submodule of repository.submodules) {
                const submodulePath = path.join(repository.root, submodule.path);

                if (submodulePath === submoduleUri.fsPath) {
                    return repository;
                }
            }
        }

        return undefined;
    }

    registerRemoteSourceProvider(provider: RemoteSourceProvider): Disposable {
        this.remoteSourceProviders.add(provider);
        this._onDidAddRemoteSourceProvider.fire(provider);

        return toDisposable(() => {
            this.remoteSourceProviders.delete(provider);
            this._onDidRemoveRemoteSourceProvider.fire(provider);
        });
    }

    registerCredentialsProvider(provider: CredentialsProvider): Disposable {
        return this.askpass.registerCredentialsProvider(provider);
    }

    getRemoteProviders(): RemoteSourceProvider[] {
        return [...this.remoteSourceProviders.values()];
    }

    registerPushErrorHandler(handler: PushErrorHandler): Disposable {
        this.pushErrorHandlers.add(handler);
        return toDisposable(() => this.pushErrorHandlers.delete(handler));
    }

    getPushErrorHandlers(): PushErrorHandler[] {
        return [...this.pushErrorHandlers];
    }

    dispose(): void {
        const openRepositories = [...this.openRepositories];
        openRepositories.forEach(r => r.dispose());
        this.openRepositories = [];

        this.possibleGitRepositoryPaths.clear();
        this.disposables = dispose(this.disposables);
    }
}

function shouldRepositoryBeIgnored(repositoryRoot: string): boolean {
    const config = workspace.getConfiguration("git");
    const ignoredRepos = config.get<string[]>("ignoredRepositories") || [];

    for (const ignoredRepo of ignoredRepos) {
        if (path.isAbsolute(ignoredRepo)) {
            if (pathEquals(ignoredRepo, repositoryRoot)) {
                return true;
            }
        } else {
            for (const folder of workspace.workspaceFolders || []) {
                if (pathEquals(path.join(folder.uri.fsPath, ignoredRepo), repositoryRoot)) {
                    return true;
                }
            }
        }
    }

    return false;
}
