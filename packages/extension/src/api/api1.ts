/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, SourceControl, SourceControlInputBox, Uri } from "vscode";
import { Repository as BaseRepository, Resource } from "../repository.js";
import { mapEvent } from "../util.js";
import {
    Branch,
    BranchQuery,
    Change,
    Commit,
    CommitOptions,
    FetchOptions,
    ForcePushMode,
    InputBox,
    LogOptions,
    Ref,
    Remote,
    Repository,
    RepositoryState,
    RepositoryUIState,
    Status,
    Submodule,
} from "./git.js";

class ApiInputBox implements InputBox {
    set value(value: string) {
        this._inputBox.value = value;
    }
    get value(): string {
        return this._inputBox.value;
    }
    constructor(private _inputBox: SourceControlInputBox) {}
}

export class ApiChange implements Change {
    get uri(): Uri {
        return this.resource.resourceUri;
    }
    get originalUri(): Uri {
        return this.resource.original;
    }
    get renameUri(): Uri | undefined {
        return this.resource.renameResourceUri;
    }
    get status(): Status {
        return this.resource.type;
    }

    constructor(private readonly resource: Resource) {}
}

export class ApiRepositoryState implements RepositoryState {
    get HEAD(): Branch | undefined {
        return this._repository.HEAD;
    }
    get refs(): Ref[] {
        return [...this._repository.refs];
    }
    get remotes(): Remote[] {
        return [...this._repository.remotes];
    }
    get submodules(): Submodule[] {
        return [...this._repository.submodules];
    }
    get rebaseCommit(): Commit | undefined {
        return this._repository.rebaseCommit;
    }

    get mergeChanges(): Change[] {
        return this._repository.mergeGroup.resourceStates.map(r => new ApiChange(r));
    }
    get indexChanges(): Change[] {
        return this._repository.indexGroup.resourceStates.map(r => new ApiChange(r));
    }
    get workingTreeChanges(): Change[] {
        return this._repository.workingTreeGroup.resourceStates.map(r => new ApiChange(r));
    }

    readonly onDidChange: Event<void> = this._repository.onDidRunGitStatus;

    constructor(private _repository: BaseRepository) {}
}

export class ApiRepositoryUIState implements RepositoryUIState {
    readonly onDidChange: Event<void> = mapEvent<boolean, void>(
        () => ({ dispose() {} }),
        // this._sourceControl.onDidChangeSelection,
        () => null,
    );

    // @ts-expect-error
    constructor(private _sourceControl: SourceControl) {}
}

export class ApiRepository implements Repository {
    readonly rootUri: Uri = Uri.file(this._repository.root);
    readonly inputBox: InputBox = new ApiInputBox(this._repository.inputBox);
    readonly state: RepositoryState = new ApiRepositoryState(this._repository);
    readonly ui: RepositoryUIState = new ApiRepositoryUIState(this._repository.sourceControl);

    constructor(private _repository: BaseRepository) {}

    apply(patch: string, reverse?: boolean): Promise<void> {
        return this._repository.apply(patch, reverse);
    }

    getConfigs(): Promise<{ key: string; value: string }[]> {
        return this._repository.getConfigs();
    }

    getConfig(key: string): Promise<string> {
        return this._repository.getConfig(key);
    }

    setConfig(key: string, value: string): Promise<string> {
        return this._repository.setConfig(key, value);
    }

    getGlobalConfig(key: string): Promise<string> {
        return this._repository.getGlobalConfig(key);
    }

    getObjectDetails(treeish: string, path: string): Promise<{ mode: string; object: string; size: number }> {
        return this._repository.getObjectDetails(treeish, path);
    }

    buffer(ref: string, filePath: string): Promise<Buffer> {
        return this._repository.buffer(ref, filePath);
    }

    show(ref: string, path: string): Promise<string> {
        return this._repository.show(ref, path);
    }

    getCommit(ref: string): Promise<Commit> {
        return this._repository.getCommit(ref);
    }

    clean(paths: string[]) {
        return this._repository.clean(paths.map(p => Uri.file(p)));
    }

    diff(cached?: boolean) {
        return this._repository.diff(cached);
    }

    diffWithHEAD(): Promise<Change[]>;
    diffWithHEAD(path: string): Promise<string>;
    diffWithHEAD(path?: string): Promise<string | Change[]> {
        return this._repository.diffWithHEAD(path);
    }

    diffWith(ref: string): Promise<Change[]>;
    diffWith(ref: string, path: string): Promise<string>;
    diffWith(ref: string, path?: string): Promise<string | Change[]> {
        return this._repository.diffWith(ref, path);
    }

    diffIndexWithHEAD(): Promise<Change[]>;
    diffIndexWithHEAD(path: string): Promise<string>;
    diffIndexWithHEAD(path?: string): Promise<string | Change[]> {
        return this._repository.diffIndexWithHEAD(path);
    }

    diffIndexWith(ref: string): Promise<Change[]>;
    diffIndexWith(ref: string, path: string): Promise<string>;
    diffIndexWith(ref: string, path?: string): Promise<string | Change[]> {
        return this._repository.diffIndexWith(ref, path);
    }

    diffBlobs(object1: string, object2: string): Promise<string> {
        return this._repository.diffBlobs(object1, object2);
    }

    diffBetween(ref1: string, ref2: string): Promise<Change[]>;
    diffBetween(ref1: string, ref2: string, path: string): Promise<string>;
    diffBetween(ref1: string, ref2: string, path?: string): Promise<string | Change[]> {
        return this._repository.diffBetween(ref1, ref2, path);
    }

    hashObject(data: string): Promise<string> {
        return this._repository.hashObject(data);
    }

    createBranch(name: string, checkout: boolean, ref?: string | undefined): Promise<void> {
        return this._repository.branch(name, checkout, ref);
    }

    deleteBranch(name: string, force?: boolean): Promise<void> {
        return this._repository.deleteBranch(name, force);
    }

    getBranch(name: string): Promise<Branch> {
        return this._repository.getBranch(name);
    }

    getBranches(query: BranchQuery): Promise<Ref[]> {
        return this._repository.getBranches(query);
    }

    setBranchUpstream(name: string, upstream: string): Promise<void> {
        return this._repository.setBranchUpstream(name, upstream);
    }

    getMergeBase(ref1: string, ref2: string): Promise<string> {
        return this._repository.getMergeBase(ref1, ref2);
    }

    status(): Promise<void> {
        return this._repository.status();
    }

    checkout(treeish: string): Promise<void> {
        return this._repository.checkout(treeish);
    }

    addRemote(name: string, url: string): Promise<void> {
        return this._repository.addRemote(name, url);
    }

    removeRemote(name: string): Promise<void> {
        return this._repository.removeRemote(name);
    }

    renameRemote(name: string, newName: string): Promise<void> {
        return this._repository.renameRemote(name, newName);
    }

    fetch(
        arg0?: FetchOptions | string | undefined,
        ref?: string | undefined,
        depth?: number | undefined,
        prune?: boolean | undefined,
    ): Promise<void> {
        if (arg0 !== undefined && typeof arg0 !== "string") {
            return this._repository.fetch(arg0);
        }

        return this._repository.fetch({ remote: arg0, ref, depth, prune });
    }

    pull(unshallow?: boolean): Promise<void> {
        return this._repository.pull(undefined, unshallow);
    }

    push(remoteName?: string, branchName?: string, setUpstream: boolean = false, force?: ForcePushMode): Promise<void> {
        return this._repository.pushTo(remoteName, branchName, setUpstream, force);
    }

    blame(path: string): Promise<string> {
        return this._repository.blame(path);
    }

    log(options?: LogOptions): Promise<Commit[]> {
        return this._repository.log(options);
    }

    commit(message: string, opts?: CommitOptions): Promise<void> {
        return this._repository.commit(message, opts);
    }
}
