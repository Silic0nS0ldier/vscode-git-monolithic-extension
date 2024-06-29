/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "node:fs";
import * as path from "node:path";
import onetime from "onetime";
import {
    commands,
    type ConfigurationChangeEvent,
    Disposable,
    type Event,
    EventEmitter,
    type Memento,
    type OutputChannel,
    type QuickPickItem,
    type SourceControl,
    type SourceControlResourceGroup,
    type TextEditor,
    Uri,
    window,
    workspace,
    type WorkspaceFoldersChangeEvent,
} from "vscode";
import { ApiRepository } from "./api/api1.js";
import type {
    APIState as State,
    CredentialsProvider,
    PublishEvent,
    PushErrorHandler,
    RemoteSourceProvider,
} from "./api/git.js";
import type { Askpass } from "./askpass.js";
import type { Git } from "./git.js";
import * as i18n from "./i18n/mod.js";
import { prettyPrint } from "./logging/pretty-print.js";
import { debounce } from "./package-patches/just-debounce.js";
import { throat } from "./package-patches/throat.js";
import type { IPushErrorHandlerRegistry } from "./pushError.js";
import type { IRemoteSourceProviderRegistry } from "./remoteProvider.js";
import type { AbstractRepository } from "./repository/repository-class/AbstractRepository.js";
import { isAbstractRepository } from "./repository/repository-class/isAbstractRepository.js";
import { createRepository } from "./repository/repository-class/mod.js";
import { RepositoryState } from "./repository/RepositoryState.js";
import { fromGitUri } from "./uri.js";
import * as config from "./util/config.js";
import { dispose, toDisposable } from "./util/disposals.js";
import { anyEvent, eventToPromise, filterEvent } from "./util/events.js";
import { isDescendant, pathEquals } from "./util/paths.js";

class RepositoryPick implements QuickPickItem {
    get label(): string {
        return this.#label();
    }

    #label = onetime(() => path.basename(this.repository.root));

    get description(): string {
        return this.#description();
    }

    #description = onetime(() => {
        return [this.repository.headLabel, this.repository.syncLabel]
            .filter(l => !!l)
            .join(" ");
    });

    constructor(public readonly repository: AbstractRepository, public readonly index: number) {}
}

export interface ModelChangeEvent {
    repository: AbstractRepository;
    uri: Uri;
}

export interface OriginalResourceChangeEvent {
    repository: AbstractRepository;
    uri: Uri;
}

interface OpenRepository extends Disposable {
    repository: AbstractRepository;
}

export class Model implements IRemoteSourceProviderRegistry, IPushErrorHandlerRegistry {
    #onDidOpenRepositoryEmitter = new EventEmitter<AbstractRepository>();
    readonly onDidOpenRepository: Event<AbstractRepository> = this.#onDidOpenRepositoryEmitter.event;

    #onDidCloseRepositoryEmitter = new EventEmitter<AbstractRepository>();
    readonly onDidCloseRepository: Event<AbstractRepository> = this.#onDidCloseRepositoryEmitter.event;

    #onDidChangeRepositoryEmitter = new EventEmitter<ModelChangeEvent>();
    readonly onDidChangeRepository: Event<ModelChangeEvent> = this.#onDidChangeRepositoryEmitter.event;

    #onDidChangeOriginalResourceEmitter = new EventEmitter<OriginalResourceChangeEvent>();
    readonly onDidChangeOriginalResource: Event<OriginalResourceChangeEvent> =
        this.#onDidChangeOriginalResourceEmitter.event;

    #openRepositories: OpenRepository[] = [];
    get repositories(): AbstractRepository[] {
        return this.#openRepositories.map(r => r.repository);
    }

    #possibleGitRepositoryPaths = new Set<string>();

    #onDidChangeStateEmitter = new EventEmitter<State>();
    readonly onDidChangeState = this.#onDidChangeStateEmitter.event;

    #onDidPublishEmitter = new EventEmitter<PublishEvent>();
    readonly onDidPublish = this.#onDidPublishEmitter.event;

    firePublishEvent(repository: AbstractRepository, branch?: string): void {
        this.#onDidPublishEmitter.fire({ branch: branch, repository: new ApiRepository(repository) });
    }

    #state: State = "uninitialized";
    get state(): State {
        return this.#state;
    }

    setState(state: State): void {
        this.#state = state;
        this.#onDidChangeStateEmitter.fire(state);
        commands.executeCommand("setContext", "git.state", state);
    }

    isInitialized = onetime(async () => {
        if (this.#state === "initialized") {
            return Promise.resolve();
        }

        await eventToPromise(filterEvent(this.onDidChangeState, s => s === "initialized"));
    });

    #remoteSourceProviders = new Set<RemoteSourceProvider>();

    #onDidAddRemoteSourceProviderEmitter = new EventEmitter<RemoteSourceProvider>();
    readonly onDidAddRemoteSourceProvider = this.#onDidAddRemoteSourceProviderEmitter.event;

    #onDidRemoveRemoteSourceProviderEmitter = new EventEmitter<RemoteSourceProvider>();
    readonly onDidRemoveRemoteSourceProvider = this.#onDidRemoveRemoteSourceProviderEmitter.event;

    #pushErrorHandlers = new Set<PushErrorHandler>();

    #disposables: Disposable[] = [];
    readonly #askpass: Askpass;
    #globalState: Memento;
    #outputChannel: OutputChannel;

    constructor(
        readonly git: Git,
        askpass: Askpass,
        globalState: Memento,
        outputChannel: OutputChannel,
    ) {
        this.#askpass = askpass;
        this.#globalState = globalState;
        this.#outputChannel = outputChannel;
        workspace.onDidChangeWorkspaceFolders(this.#onDidChangeWorkspaceFolders, this, this.#disposables);
        window.onDidChangeVisibleTextEditors(this.#onDidChangeVisibleTextEditors, this, this.#disposables);
        workspace.onDidChangeConfiguration(this.#onDidChangeConfiguration, this, this.#disposables);

        // Watchers are responsible for identifying deletion and addition of repositories (main and worktrees)
        const gitMainTreeWatcher = workspace.createFileSystemWatcher("**/.git/HEAD", false, true, false);
        const gitWorkTreeWatcher = workspace.createFileSystemWatcher("**/.git", false, true, false);
        this.#disposables.push(gitMainTreeWatcher, gitWorkTreeWatcher);
        const onGitIndexEvent = anyEvent(
            gitMainTreeWatcher.onDidCreate,
            gitMainTreeWatcher.onDidDelete,
            gitWorkTreeWatcher.onDidCreate,
            gitWorkTreeWatcher.onDidDelete,
        );
        onGitIndexEvent(this.#onPossibleGitRepositoryChange, this, this.#disposables);

        this.setState("uninitialized");
        this.#doInitialScan().finally(() => this.setState("initialized"));
    }

    async #doInitialScan(): Promise<void> {
        await Promise.all([
            this.#onDidChangeWorkspaceFolders({ added: workspace.workspaceFolders || [], removed: [] }),
            this.#onDidChangeVisibleTextEditors(window.visibleTextEditors),
            this.#scanWorkspaceFolders(),
        ]);
    }

    /**
     * Scans the first level of each workspace folder, looking
     * for git repositories.
     */
    async #scanWorkspaceFolders(): Promise<void> {
        const autoRepositoryDetection = config.autoRepositoryDetection();

        if (autoRepositoryDetection !== true && autoRepositoryDetection !== "subFolders") {
            return;
        }

        await Promise.all((workspace.workspaceFolders || []).map(async folder => {
            const root = folder.uri.fsPath;
            const children = await new Promise<string[]>((c, e) => fs.readdir(root, (err, r) => err ? e(err) : c(r)));
            const subfolders = new Set(children.filter(child => child !== ".git").map(child => path.join(root, child)));

            const scanPaths = workspace.isTrusted
                ? config.scanRepositories(folder.uri)
                : config.scanRepositories();
            for (const scanPath of scanPaths) {
                if (scanPath !== ".git") {
                    continue;
                }

                if (path.isAbsolute(scanPath)) {
                    this.#outputChannel.appendLine(
                        "[WARN] "
                            + i18n.Translations.notSupported(),
                    );
                    continue;
                }

                subfolders.add(path.join(root, scanPath));
            }

            await Promise.all([...subfolders].map(f => this.openRepository(f)));
        }));
    }

    #onPossibleGitRepositoryChange(uri: Uri): void {
        // TODO Handle repository removal
        // Only process new repositories
        if (this.getRepository(uri)) {
            return;
        }

        const autoRepositoryDetection = config.autoRepositoryDetection();

        if (autoRepositoryDetection === false) {
            return;
        }

        this.#eventuallyScanPossibleGitRepository(uri.fsPath.replace(/\.git.*$/, ""));
    }

    #eventuallyScanPossibleGitRepository(path: string): void {
        this.#possibleGitRepositoryPaths.add(path);
        this.#eventuallyScanPossibleGitRepositories();
    }

    #eventuallyScanPossibleGitRepositories = debounce(() => {
        for (const path of this.#possibleGitRepositoryPaths) {
            this.openRepository(path);
        }

        this.#possibleGitRepositoryPaths.clear();
    }, 500);

    async #onDidChangeWorkspaceFolders({ added, removed }: WorkspaceFoldersChangeEvent): Promise<void> {
        const possibleRepositoryFolders = added
            .filter(folder => !this.#getOpenRepository(folder.uri));

        const activeRepositoriesList = window.visibleTextEditors
            .map(editor => this.getRepository(editor.document.uri))
            .filter(repository => !!repository) as AbstractRepository[];

        const activeRepositories = new Set<AbstractRepository>(activeRepositoriesList);
        const openRepositoriesToDispose = removed
            .map(folder => this.#getOpenRepository(folder.uri))
            .filter<OpenRepository>((r => !!r) as (v: OpenRepository | undefined) => v is OpenRepository)
            .filter(r => !activeRepositories.has(r.repository))
            .filter(r =>
                !(workspace.workspaceFolders || []).some(f => isDescendant(f.uri.fsPath, r.repository.root))
            ) as OpenRepository[];

        openRepositoriesToDispose.forEach(r => r.dispose());
        await Promise.all(possibleRepositoryFolders.map(p => this.openRepository(p.uri.fsPath)));
    }

    /**
     * @todo Config hook should be consolidated
     */
    #onDidChangeConfiguration(e: ConfigurationChangeEvent): void {
        // NOTE This is imperfect as individual repositories may have their own configuration
        // Considered an acceptable trade off as continuely refreshing based on all config changes
        // is expensive
        if (!e.affectsConfiguration("git")) {
            return;
        }

        const possibleRepositoryFolders = (workspace.workspaceFolders || [])
            .filter(folder => config.enabled(folder.uri))
            .filter(folder => !this.#getOpenRepository(folder.uri));

        const openRepositoriesToDispose = this.#openRepositories
            .map(repository => ({ repository, root: Uri.file(repository.repository.root) }))
            .filter(({ root }) => !config.enabled(root))
            .map(({ repository }) => repository);

        possibleRepositoryFolders.forEach(p => this.openRepository(p.uri.fsPath));
        openRepositoriesToDispose.forEach(r => r.dispose());
    }

    async #onDidChangeVisibleTextEditors(editors: readonly TextEditor[]): Promise<void> {
        if (!workspace.isTrusted) {
            return;
        }

        const autoRepositoryDetection = config.autoRepositoryDetection();

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

        const enabled = config.enabled(Uri.file(repoPath));

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
                this.#globalState,
                this.#outputChannel,
            );

            this.#open(repository);
            await repository.status();
        } catch (ex) {
            // noop
            this.#outputChannel.appendLine(
                `Opening repository for path='${repoPath}' failed; ex=${await prettyPrint(ex)}`,
            );
        }
    });

    #open(repository: AbstractRepository): void {
        this.#outputChannel.appendLine(`Open repository: ${repository.root}`);

        const onDidDisappearRepository = filterEvent(
            repository.onDidChangeState,
            state => state === RepositoryState.Disposed,
        );
        const disappearListener = onDidDisappearRepository(() => dispose());
        const changeListener = repository.onDidChangeRepository(uri =>
            this.#onDidChangeRepositoryEmitter.fire({ repository, uri })
        );
        const originalResourceChangeListener = repository.onDidChangeOriginalResource(uri =>
            this.#onDidChangeOriginalResourceEmitter.fire({ repository, uri })
        );

        const shouldDetectSubmodules = workspace
            .getConfiguration("git", Uri.file(repository.root))
            .get<boolean>("detectSubmodules") as boolean;

        const submodulesLimit = workspace
            .getConfiguration("git", Uri.file(repository.root))
            .get<number>("detectSubmodulesLimit") as number;

        const checkForSubmodules = (): void => {
            if (!shouldDetectSubmodules) {
                return;
            }

            if (repository.submodules.length > submodulesLimit) {
                window.showWarningMessage(
                    i18n.Translations.tooManySubmodules(
                        // TODO If there are multiple repositories open in workspace, this will be a source of confusion
                        path.basename(repository.root),
                        repository.submodules.length,
                    ),
                );
                statusListener.dispose();
            }

            repository.submodules
                .slice(0, submodulesLimit)
                .map(r => path.join(repository.root, r.path))
                .forEach(p => this.#eventuallyScanPossibleGitRepository(p));
        };

        const statusListener = repository.onDidChangeStatus(checkForSubmodules);
        checkForSubmodules();

        const dispose = (): void => {
            disappearListener.dispose();
            changeListener.dispose();
            originalResourceChangeListener.dispose();
            statusListener.dispose();
            repository.dispose();

            this.#openRepositories = this.#openRepositories.filter(e => e !== openRepository);
            this.#onDidCloseRepositoryEmitter.fire(repository);
        };

        const openRepository = { dispose, repository };
        this.#openRepositories.push(openRepository);
        this.#onDidOpenRepositoryEmitter.fire(repository);
    }

    close(repository: AbstractRepository): void {
        const openRepository = this.#getOpenRepository(repository);

        if (!openRepository) {
            return;
        }

        this.#outputChannel.appendLine(`Close repository: ${repository.root}`);
        openRepository.dispose();
    }

    async pickRepository(): Promise<AbstractRepository | undefined> {
        if (this.#openRepositories.length === 0) {
            // TODO Errors should be internal, localisation not necessary
            throw new Error(i18n.Translations.noRepositories());
        }

        const picks = this.#openRepositories.map((e, index) => new RepositoryPick(e.repository, index));
        const active = window.activeTextEditor;
        const repository = active && this.getRepository(active.document.fileName);
        const index = picks.findIndex(pick => pick.repository === repository);

        // Move repository pick containing the active text editor to appear first
        if (index > -1) {
            picks.unshift(...picks.splice(index, 1));
        }

        const placeHolder = i18n.Translations.pickRepo();
        const pick = await window.showQuickPick(picks, { placeHolder });

        return pick && pick.repository;
    }

    getRepository(sourceControl: SourceControl): AbstractRepository | undefined;
    getRepository(resourceGroup: SourceControlResourceGroup): AbstractRepository | undefined;
    getRepository(path: string): AbstractRepository | undefined;
    getRepository(resource: Uri): AbstractRepository | undefined;
    getRepository(hint: any): AbstractRepository | undefined {
        const liveRepository = this.#getOpenRepository(hint);
        return liveRepository && liveRepository.repository;
    }

    /** @todo This API is horrific, it should not be needed. */
    #getOpenRepository(repository: AbstractRepository): OpenRepository | undefined;
    #getOpenRepository(sourceControl: SourceControl): OpenRepository | undefined;
    #getOpenRepository(resourceGroup: SourceControlResourceGroup): OpenRepository | undefined;
    #getOpenRepository(path: string): OpenRepository | undefined;
    #getOpenRepository(resource: Uri): OpenRepository | undefined;
    #getOpenRepository(hint: any): OpenRepository | undefined {
        let normalisedHint = hint;
        if (!normalisedHint) {
            return undefined;
        }

        if (isAbstractRepository(normalisedHint)) {
            const stableHint = normalisedHint;
            return this.#openRepositories.filter(r => r.repository === stableHint)[0];
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
                const liveRepository of this.#openRepositories.sort((a, b) =>
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

        for (const liveRepository of this.#openRepositories) {
            const repository = liveRepository.repository;

            if (normalisedHint === repository.sourceControlUI.sourceControl) {
                return liveRepository;
            }

            if (
                normalisedHint === repository.sourceControlUI.mergeGroup
                || normalisedHint === repository.sourceControlUI.stagedGroup
                || normalisedHint === repository.sourceControlUI.trackedGroup
            ) {
                return liveRepository;
            }
        }

        return undefined;
    }

    getRepositoryForSubmodule(submoduleUri: Uri): AbstractRepository | undefined {
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
        this.#remoteSourceProviders.add(provider);
        this.#onDidAddRemoteSourceProviderEmitter.fire(provider);

        return toDisposable(() => {
            this.#remoteSourceProviders.delete(provider);
            this.#onDidRemoveRemoteSourceProviderEmitter.fire(provider);
        });
    }

    registerCredentialsProvider(provider: CredentialsProvider): Disposable {
        return this.#askpass.registerCredentialsProvider(provider);
    }

    getRemoteProviders(): RemoteSourceProvider[] {
        return [...this.#remoteSourceProviders.values()];
    }

    registerPushErrorHandler(handler: PushErrorHandler): Disposable {
        this.#pushErrorHandlers.add(handler);
        return toDisposable(() => this.#pushErrorHandlers.delete(handler));
    }

    getPushErrorHandlers(): PushErrorHandler[] {
        return [...this.#pushErrorHandlers];
    }

    dispose(): void {
        const openRepositories = [...this.#openRepositories];
        openRepositories.forEach(r => r.dispose());
        this.#openRepositories = [];

        this.#possibleGitRepositoryPaths.clear();
        this.#disposables = dispose(this.#disposables);
    }
}

function shouldRepositoryBeIgnored(repositoryRoot: string): boolean {
    const ignoredRepos = config.ignoredRepositories();

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
