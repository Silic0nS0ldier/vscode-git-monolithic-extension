/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findTrackingBranches } from "monolithic-git-interop/api/repository/find-tracking-branches";
import { init } from "monolithic-git-interop/api/repository/init";
import { get as getRemotes } from "monolithic-git-interop/api/repository/remotes/get";
import { gitDir } from "monolithic-git-interop/api/rev-parse/git-dir";
import { showToplevel } from "monolithic-git-interop/api/rev-parse/show-toplevel";
import type { GitContext } from "monolithic-git-interop/cli";
import type { AllServices } from "monolithic-git-interop/services";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isOk, unwrap } from "monolithic-git-interop/util/result";
import type * as cp from "node:child_process";
import { EventEmitter } from "node:events";
import { exists, promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { Progress, Uri } from "vscode";
import {
    type Branch,
    type BranchQuery,
    type Change,
    type CommitOptions,
    ForcePushMode,
    type ForcePushModeOptions,
    GitErrorCodes,
    type LogOptions,
    type Ref,
    RefType,
    type Remote,
} from "./api/git.js";
import type { Commit } from "./git/Commit.js";
import { GitError } from "./git/error.js";
import { exec, type IExecutionResult } from "./git/exec.js";
import { diffBetween, diffIndexWith, diffIndexWithHEAD, diffWith, diffWithHEAD } from "./git/git-class/diff.js";
import { internalExec } from "./git/git-class/internal-exec.js";
import { internalSpawn } from "./git/git-class/internal-spawn.js";
import { sanitizePath } from "./git/helpers.js";
import type { IFileStatus } from "./git/IFileStatus.js";
import type { LogFileOptions } from "./git/LogFileOptions.js";
import { parseGitCommits } from "./git/parseGitCommits.js";
import { parseGitmodules } from "./git/parseGitmodules.js";
import { type LsFilesElement, parseLsFiles } from "./git/parseLsFiles.js";
import { type LsTreeElement, parseLsTree } from "./git/parseLsTree.js";
import { getHEAD } from "./git/repository-class/get-head.js";
import { getStatusTrackedAndMerge } from "./git/repository-class/get-status.js";
import type { SpawnOptions } from "./git/SpawnOptions.js";
import type { Stash } from "./git/Stash.js";
import type { Submodule } from "./git/Submodule.js";
import { Limiter, splitInChunks } from "./util.js";
import { isExpectedError } from "./util/is-expected-error.js";
import { LineStream } from "./util/stream-by-line.js";
import * as Versions from "./util/versions.js";

// https://github.com/microsoft/vscode/issues/65693
const MAX_CLI_LENGTH = 30000;

interface MutableRemote extends Remote {
    fetchUrl?: string;
    pushUrl?: string;
    isReadOnly: boolean;
}

export interface IGitOptions {
    gitPath: string;
    userAgent: string;
    version: string;
    context: GitContext;
    env?: { [key: string]: string };
}

const COMMIT_FORMAT = "%H%n%aN%n%aE%n%at%n%ct%n%P%n%B";

export interface ICloneOptions {
    readonly parentPath: string;
    readonly progress: Progress<{ increment: number }>;
    readonly recursive?: boolean;
}

export class Git {
    readonly path: string;
    readonly userAgent: string;
    readonly version: string;
    // This is deliberately leaked to help migrate to new library
    readonly _context: GitContext;
    readonly #services: AllServices;
    #env: { [key: string]: string };

    #onOutputEmitter = new EventEmitter();
    get onOutput(): EventEmitter {
        return this.#onOutputEmitter;
    }

    constructor(options: IGitOptions) {
        this.path = options.gitPath;
        this.version = options.version;
        this.userAgent = options.userAgent;
        this._context = options.context;
        this.#services = createServices();
        this.#env = options.env || {};
    }

    compareGitVersionTo(version: string): -1 | 0 | 1 {
        return Versions.compare(Versions.fromString(this.version), Versions.fromString(version));
    }

    open(repository: string, dotGit: string): Repository {
        return new Repository(this, repository, dotGit);
    }

    async init(repository: string): Promise<void> {
        const result = await init(this._context, repository);

        if (isOk(result)) {
            return;
        }

        throw unwrap(result);
    }

    async clone(url: string, options: ICloneOptions, abortSignal?: AbortSignal): Promise<string> {
        let baseFolderName = decodeURI(url).replace(/[\/]+$/, "").replace(/^.*[\/\\]/, "").replace(/\.git$/, "")
            || "repository";
        let folderName = baseFolderName;
        let folderPath = path.join(options.parentPath, folderName);
        let count = 1;

        while (count < 20 && await new Promise(c => exists(folderPath, c))) {
            folderName = `${baseFolderName}-${count++}`;
            folderPath = path.join(options.parentPath, folderName);
        }

        await fs.mkdir(options.parentPath, { recursive: true });

        const onSpawn = (child: cp.ChildProcess): void => {
            if (!child.stderr) {
                return;
            }

            const decoder = new StringDecoder("utf8");
            const lineStream = new LineStream({ encoding: "utf8" });
            child.stderr.on("data", (buffer: Buffer) => lineStream.write(decoder.write(buffer)));

            let totalProgress = 0;
            let previousProgress = 0;

            lineStream.on("data", (line: string) => {
                let match: RegExpMatchArray | null = null;

                if (match = /Counting objects:\s*(\d+)%/i.exec(line)) {
                    totalProgress = Math.floor(parseInt(match[1]) * 0.1);
                } else if (match = /Compressing objects:\s*(\d+)%/i.exec(line)) {
                    totalProgress = 10 + Math.floor(parseInt(match[1]) * 0.1);
                } else if (match = /Receiving objects:\s*(\d+)%/i.exec(line)) {
                    totalProgress = 20 + Math.floor(parseInt(match[1]) * 0.4);
                } else if (match = /Resolving deltas:\s*(\d+)%/i.exec(line)) {
                    totalProgress = 60 + Math.floor(parseInt(match[1]) * 0.4);
                }

                if (totalProgress !== previousProgress) {
                    options.progress.report({ increment: totalProgress - previousProgress });
                    previousProgress = totalProgress;
                }
            });
        };

        try {
            let command = ["clone", url.includes(" ") ? encodeURI(url) : url, folderPath, "--progress"];
            if (options.recursive) {
                command.push("--recursive");
            }
            await this.exec(options.parentPath, command, {
                abortSignal,
                env: { "GIT_HTTP_USER_AGENT": this.userAgent },
                onSpawn,
            });
        } catch (err) {
            if (err instanceof GitError && err.stderr) {
                err.stderr = err.stderr.replace(/^Cloning.+$/m, "").trim();
                err.stderr = err.stderr.replace(/^ERROR:\s+/, "").trim();
            }

            throw err;
        }

        return folderPath;
    }

    async getRepositoryRoot(repositoryPath: string): Promise<string> {
        const result = await showToplevel(this._context, repositoryPath, this.#services);

        if (isOk(result)) {
            return unwrap(result);
        }

        throw unwrap(result);
    }

    async getRepositoryDotGit(repositoryPath: string): Promise<string> {
        const result = await gitDir(this._context, repositoryPath);

        if (isOk(result)) {
            return unwrap(result);
        }

        throw unwrap(result);
    }

    async exec(cwd: string, args: string[], options: SpawnOptions = {}): Promise<IExecutionResult<string>> {
        return await this.#exec(args, { cwd, ...options, log_mode: "buffer" });
    }

    async exec2(args: string[], options: SpawnOptions = {}): Promise<IExecutionResult<string>> {
        return await this.#exec(args, { ...options, log_mode: "buffer" });
    }

    stream(cwd: string, args: string[], options: SpawnOptions = {}): cp.ChildProcess {
        return this.spawn(args, { cwd, ...options, log_mode: "stream" });
    }

    async #exec(args: string[], options: SpawnOptions): Promise<IExecutionResult<string>> {
        return internalExec(this.path, this.#env, this.#log.bind(this), args, options);
    }

    spawn(args: string[], options: SpawnOptions = {}): cp.ChildProcess {
        return internalSpawn(this.path, this.#env, this.#log.bind(this), args, options);
    }

    #log(output: string): void {
        this.#onOutputEmitter.emit("log", output);
    }
}

export interface PullOptions {
    unshallow?: boolean;
    tags?: boolean;
    readonly abortSignal?: AbortSignal;
}

export class Repository {
    #git: Git;
    #repositoryRoot: string;
    constructor(
        git: Git,
        repositoryRoot: string,
        readonly dotGit: string,
    ) {
        this.#git = git;
        this.#repositoryRoot = repositoryRoot;
    }

    get git(): Git {
        return this.#git;
    }

    get root(): string {
        return this.#repositoryRoot;
    }

    async exec(args: string[], options: SpawnOptions = {}): Promise<IExecutionResult<string>> {
        return await this.git.exec(this.#repositoryRoot, args, options);
    }

    stream(args: string[], options: SpawnOptions = {}): cp.ChildProcess {
        return this.git.stream(this.#repositoryRoot, args, options);
    }

    spawn(args: string[], options: SpawnOptions = {}): cp.ChildProcess {
        return this.git.spawn(args, options);
    }

    async config(scope: string, key: string, value: string, options: SpawnOptions = {}): Promise<string> {
        const args = ["config"];

        if (scope) {
            args.push("--" + scope);
        }

        args.push(key, value);

        const result = await this.exec(args, options);
        return result.stdout.trim();
    }

    async getConfigs(scope: string): Promise<{ key: string; value: string }[]> {
        const args = ["config"];

        if (scope) {
            args.push("--" + scope);
        }

        args.push("-l");

        const result = await this.exec(args);
        const lines = result.stdout.trim().split(/\r|\r\n|\n/);

        return lines.map(entry => {
            const equalsIndex = entry.indexOf("=");
            return { key: entry.substring(0, equalsIndex), value: entry.substring(equalsIndex + 1) };
        });
    }

    async log(options?: LogOptions): Promise<Commit[]> {
        const maxEntries = options?.maxEntries ?? 32;
        const args = ["log", `-n${maxEntries}`, `--format=${COMMIT_FORMAT}`, "-z", "--"];
        if (options?.path) {
            args.push(options.path);
        }

        const result = await this.exec(args);
        if (result.exitCode) {
            // An empty repo
            return [];
        }

        return parseGitCommits(result.stdout);
    }

    async logFile(uri: Uri, options?: LogFileOptions): Promise<Commit[]> {
        const args = ["log", `--format=${COMMIT_FORMAT}`, "-z"];

        if (options?.maxEntries && !options?.reverse) {
            args.push(`-n${options.maxEntries}`);
        }

        if (options?.hash) {
            // If we are reversing, we must add a range (with HEAD) because we are using --ancestry-path for better reverse walking
            if (options?.reverse) {
                args.push("--reverse", "--ancestry-path", `${options.hash}..HEAD`);
            } else {
                args.push(options.hash);
            }
        }

        if (options?.sortByAuthorDate) {
            args.push("--author-date-order");
        }

        args.push("--", uri.fsPath);

        const result = await this.exec(args);
        if (result.exitCode) {
            // No file history, e.g. a new file or untracked
            return [];
        }

        return parseGitCommits(result.stdout);
    }

    async buffer(object: string): Promise<Buffer> {
        const child = this.stream(["show", "--textconv", object]);

        if (!child.stdout) {
            return Promise.reject<Buffer>("Can't open file from git");
        }

        const { exitCode, stdout, stderr } = await exec(child);

        if (exitCode) {
            const err = new GitError({
                exitCode,
                message: "Could not show object.",
            });

            if (/exists on disk, but not in/.test(stderr)) {
                err.gitErrorCode = GitErrorCodes.WrongCase;
            }

            return Promise.reject<Buffer>(err);
        }

        return stdout;
    }

    async getObjectDetails(treeish: string, path: string): Promise<{ mode: string; object: string; size: number }> {
        if (!treeish) { // index
            const elements = await this.lsfiles(path);

            if (elements.length === 0) {
                throw new GitError({ gitErrorCode: GitErrorCodes.UnknownPath, message: "Path not known by git" });
            }

            const { mode, object } = elements[0];
            const catFile = await this.exec(["cat-file", "-s", object]);
            const size = parseInt(catFile.stdout);

            return { mode, object, size };
        }

        const elements = await this.lstree(treeish, path);

        if (elements.length === 0) {
            throw new GitError({ gitErrorCode: GitErrorCodes.UnknownPath, message: "Path not known by git" });
        }

        const { mode, object, size } = elements[0];
        return { mode, object, size: parseInt(size) };
    }

    async lstree(treeish: string, path: string): Promise<LsTreeElement[]> {
        const { stdout } = await this.exec(["ls-tree", "-l", treeish, "--", sanitizePath(path)]);
        return parseLsTree(stdout);
    }

    async lsfiles(path: string): Promise<LsFilesElement[]> {
        const { stdout } = await this.exec(["ls-files", "--stage", "--", sanitizePath(path)]);
        return parseLsFiles(stdout);
    }

    async getGitRelativePath(ref: string, relativePath: string): Promise<string> {
        const relativePathLowercase = relativePath.toLowerCase();
        const dirname = path.posix.dirname(relativePath) + "/";
        const elements: { file: string }[] = ref ? await this.lstree(ref, dirname) : await this.lsfiles(dirname);
        const element = elements.filter(file => file.file.toLowerCase() === relativePathLowercase)[0];

        if (!element) {
            throw new GitError({ message: "Git relative path not found." });
        }

        return element.file;
    }

    async apply(patch: string, reverse?: boolean): Promise<void> {
        const args = ["apply", patch];

        if (reverse) {
            args.push("-R");
        }

        try {
            await this.exec(args);
        } catch (err) {
            if (err instanceof GitError && /patch does not apply/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.PatchDoesNotApply;
            }

            throw err;
        }
    }

    async diff(cached = false): Promise<string> {
        const args = ["diff"];

        if (cached) {
            args.push("--cached");
        }

        const result = await this.exec(args);
        return result.stdout;
    }

    diffWithHEAD(): Promise<Change[]>;
    diffWithHEAD(path: string): Promise<string>;
    diffWithHEAD(path?: string | undefined): Promise<string | Change[]>;
    async diffWithHEAD(path?: string | undefined): Promise<string | Change[]> {
        return diffWithHEAD(
            {
                exec: this.exec.bind(this),
                repositoryRoot: this.#repositoryRoot,
            },
            path,
        );
    }

    diffWith(ref: string): Promise<Change[]>;
    diffWith(ref: string, path: string): Promise<string>;
    diffWith(ref: string, path?: string | undefined): Promise<string | Change[]>;
    async diffWith(ref: string, path?: string): Promise<string | Change[]> {
        return diffWith(
            {
                exec: this.exec.bind(this),
                repositoryRoot: this.#repositoryRoot,
            },
            ref,
            path,
        );
    }

    diffIndexWithHEAD(): Promise<Change[]>;
    diffIndexWithHEAD(path: string): Promise<string>;
    diffIndexWithHEAD(path?: string | undefined): Promise<string | Change[]>;
    async diffIndexWithHEAD(path?: string): Promise<string | Change[]> {
        return diffIndexWithHEAD(
            {
                exec: this.exec.bind(this),
                repositoryRoot: this.#repositoryRoot,
            },
            path,
        );
    }

    diffIndexWith(ref: string): Promise<Change[]>;
    diffIndexWith(ref: string, path: string): Promise<string>;
    diffIndexWith(ref: string, path?: string | undefined): Promise<string | Change[]>;
    async diffIndexWith(ref: string, path?: string): Promise<string | Change[]> {
        return diffIndexWith(
            {
                exec: this.exec.bind(this),
                repositoryRoot: this.#repositoryRoot,
            },
            ref,
            path,
        );
    }

    async diffBlobs(object1: string, object2: string): Promise<string> {
        const args = ["diff", object1, object2];
        const result = await this.exec(args);
        return result.stdout;
    }

    diffBetween(ref1: string, ref2: string, path?: undefined): Promise<Change[]>;
    diffBetween(ref1: string, ref2: string, path: string): Promise<string>;
    diffBetween(ref1: string, ref2: string, path?: string | undefined): Promise<string | Change[]>;
    async diffBetween(ref1: string, ref2: string, path?: string): Promise<string | Change[]> {
        return diffBetween(
            {
                exec: this.exec.bind(this),
                repositoryRoot: this.#repositoryRoot,
            },
            ref1,
            ref2,
            path,
        );
    }

    async getMergeBase(ref1: string, ref2: string): Promise<string> {
        const args = ["merge-base", ref1, ref2];
        const result = await this.exec(args);

        return result.stdout.trim();
    }

    async hashObject(data: string): Promise<string> {
        const args = ["hash-object", "-w", "--stdin"];
        const result = await this.exec(args, { input: data });

        return result.stdout.trim();
    }

    async add(paths: string[], opts?: { update?: boolean }): Promise<void> {
        const args = ["add"];

        if (opts && opts.update) {
            args.push("-u");
        } else {
            args.push("-A");
        }

        if (paths && paths.length) {
            for (const chunk of splitInChunks(paths.map(sanitizePath), MAX_CLI_LENGTH)) {
                await this.exec([...args, "--", ...chunk]);
            }
        } else {
            await this.exec([...args, "--", "."]);
        }
    }

    async rm(paths: string[]): Promise<void> {
        const args = ["rm", "--"];

        if (!paths || !paths.length) {
            return;
        }

        args.push(...paths.map(sanitizePath));

        await this.exec(args);
    }

    async stage(path: string, data: string): Promise<void> {
        const child = this.stream(["hash-object", "--stdin", "-w", "--path", sanitizePath(path)], {
            stdio: [null, null, null],
        });
        if (!child.stdin) {
            throw new Error("stdin not available");
        }
        child.stdin.end(data, "utf8");

        const { exitCode, stdout } = await exec(child);
        const hash = stdout.toString("utf8");

        if (exitCode) {
            throw new GitError({
                exitCode: exitCode,
                message: "Could not hash object.",
            });
        }

        const treeish = await this.getCommit("HEAD").then(() => "HEAD", () => "");
        let mode: string;
        let add: string = "";

        try {
            const details = await this.getObjectDetails(treeish, path);
            mode = details.mode;
        } catch (err) {
            if (!isExpectedError(err, GitError, e => e.gitErrorCode === GitErrorCodes.UnknownPath)) {
                throw err;
            }

            mode = "100644";
            add = "--add";
        }

        await this.exec(["update-index", add, "--cacheinfo", mode, hash, path]);
    }

    async checkout(
        treeish: string,
        paths: string[],
        opts: { track?: boolean; detached?: boolean } = Object.create(null),
    ): Promise<void> {
        const args = ["checkout", "-q"];

        if (opts.track) {
            args.push("--track");
        }

        if (opts.detached) {
            args.push("--detach");
        }

        if (treeish) {
            args.push(treeish);
        }

        try {
            if (paths && paths.length > 0) {
                for (const chunk of splitInChunks(paths.map(sanitizePath), MAX_CLI_LENGTH)) {
                    await this.exec([...args, "--", ...chunk]);
                }
            } else {
                await this.exec(args);
            }
        } catch (err) {
            if (err instanceof GitError && /Please,? commit your changes or stash them/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.DirtyWorkTree;
                err.gitTreeish = treeish;
            }

            throw err;
        }
    }

    async commit(message: string | undefined, opts: CommitOptions = Object.create(null)): Promise<void> {
        const args = ["commit", "--quiet", "--allow-empty-message"];

        if (opts.all) {
            args.push("--all");
        }

        if (opts.amend && message) {
            args.push("--amend");
        }

        if (opts.amend && !message) {
            args.push("--amend", "--no-edit");
        } else {
            args.push("--file", "-");
        }

        if (opts.signoff) {
            args.push("--signoff");
        }

        if (opts.signCommit) {
            args.push("-S");
        }

        if (opts.empty) {
            args.push("--allow-empty");
        }

        if (opts.noVerify) {
            args.push("--no-verify");
        }

        if (opts.requireUserConfig ?? true) {
            // Stops git from guessing at user/email
            args.splice(0, 0, "-c", "user.useConfigOnly=true");
        }

        try {
            await this.exec(args, !opts.amend || message ? { input: message || "" } : {});
        } catch (commitErr) {
            await this.#handleCommitError(commitErr);
        }
    }

    async rebaseAbort(): Promise<void> {
        await this.exec(["rebase", "--abort"]);
    }

    async rebaseContinue(): Promise<void> {
        const args = ["rebase", "--continue"];

        try {
            await this.exec(args);
        } catch (commitErr) {
            await this.#handleCommitError(commitErr);
        }
    }

    async #handleCommitError(commitErr: unknown): Promise<void> {
        if (
            commitErr instanceof GitError && /not possible because you have unmerged files/.test(commitErr.stderr || "")
        ) {
            commitErr.gitErrorCode = GitErrorCodes.UnmergedChanges;
            throw commitErr;
        }

        try {
            await this.exec(["config", "--get-all", "user.name"]);
        } catch (err) {
            const gitErr = new GitError({}, { cause: new AggregateError([commitErr, err]) });
            gitErr.gitErrorCode = GitErrorCodes.NoUserNameConfigured;
            throw gitErr;
        }

        try {
            await this.exec(["config", "--get-all", "user.email"]);
        } catch (err) {
            const gitErr = new GitError({}, { cause: new AggregateError([commitErr, err]) });
            gitErr.gitErrorCode = GitErrorCodes.NoUserEmailConfigured;
            throw gitErr;
        }

        throw commitErr;
    }

    async branch(name: string, checkout: boolean, ref?: string): Promise<void> {
        const args = checkout ? ["checkout", "-q", "-b", name, "--no-track"] : ["branch", "-q", name];

        if (ref) {
            args.push(ref);
        }

        await this.exec(args);
    }

    async deleteBranch(name: string, force?: boolean): Promise<void> {
        const args = ["branch", force ? "-D" : "-d", name];
        await this.exec(args);
    }

    async renameBranch(name: string): Promise<void> {
        const args = ["branch", "-m", name];
        await this.exec(args);
    }

    async move(from: string, to: string): Promise<void> {
        const args = ["mv", from, to];
        await this.exec(args);
    }

    async setBranchUpstream(name: string, upstream: string): Promise<void> {
        const args = ["branch", "--set-upstream-to", upstream, name];
        await this.exec(args);
    }

    async deleteRef(ref: string): Promise<void> {
        const args = ["update-ref", "-d", ref];
        await this.exec(args);
    }

    async merge(ref: string): Promise<void> {
        const args = ["merge", ref];

        try {
            await this.exec(args);
        } catch (err) {
            if (err instanceof GitError && /^CONFLICT /m.test(err.stdout || "")) {
                err.gitErrorCode = GitErrorCodes.Conflict;
            }

            throw err;
        }
    }

    async tag(name: string, message?: string): Promise<void> {
        let args = ["tag"];

        if (message) {
            args = [...args, "-a", name, "-m", message];
        } else {
            args = [...args, name];
        }

        await this.exec(args);
    }

    async deleteTag(name: string): Promise<void> {
        let args = ["tag", "-d", name];
        await this.exec(args);
    }

    async clean(paths: string[]): Promise<void> {
        const limiter = new Limiter(5);
        const promises: Promise<unknown>[] = [];
        const args = ["clean", "-f", "-q"];

        for (const chunk of splitInChunks(paths.map(sanitizePath), MAX_CLI_LENGTH)) {
            promises.push(limiter.queue(() => this.exec([...args, "--", ...chunk])));
        }

        await Promise.all(promises);
    }

    async undo(): Promise<void> {
        await this.exec(["clean", "-fd"]);

        try {
            await this.exec(["checkout", "--", "."]);
        } catch (err) {
            if (err instanceof GitError && /did not match any file\(s\) known to git\./.test(err.stderr || "")) {
                return;
            }

            throw err;
        }
    }

    async reset(treeish: string, hard: boolean = false): Promise<void> {
        const args = ["reset", hard ? "--hard" : "--soft", treeish];
        await this.exec(args);
    }

    async revert(treeish: string, paths: string[]): Promise<void> {
        const result = await this.exec(["branch"]);
        let args: string[];

        // In case there are no branches, we must use rm --cached
        if (!result.stdout) {
            args = ["rm", "--cached", "-r"];
        } else {
            args = ["reset", "-q", treeish];
        }

        try {
            if (paths && paths.length > 0) {
                for (const chunk of splitInChunks(paths.map(sanitizePath), MAX_CLI_LENGTH)) {
                    await this.exec([...args, "--", ...chunk]);
                }
            } else {
                await this.exec([...args, "--", "."]);
            }
        } catch (err) {
            // In case there are merge conflicts to be resolved, git reset will output
            // some "needs merge" data. We try to get around that.
            if (err instanceof GitError && /([^:]+: needs merge\n)+/m.test(err.stdout || "")) {
                return;
            }

            throw err;
        }
    }

    async addRemote(name: string, url: string): Promise<void> {
        const args = ["remote", "add", name, url];
        await this.exec(args);
    }

    async removeRemote(name: string): Promise<void> {
        const args = ["remote", "remove", name];
        await this.exec(args);
    }

    async renameRemote(name: string, newName: string): Promise<void> {
        const args = ["remote", "rename", name, newName];
        await this.exec(args);
    }

    async fetch(
        options: {
            remote?: string;
            ref?: string;
            all?: boolean;
            prune?: boolean;
            depth?: number;
            silent?: boolean;
            readonly abortSignal?: AbortSignal;
        } = {},
    ): Promise<void> {
        const args = ["fetch"];
        const spawnOptions: SpawnOptions = {
            abortSignal: options.abortSignal,
            env: { "GIT_HTTP_USER_AGENT": this.git.userAgent },
        };

        if (options.remote) {
            args.push(options.remote);

            if (options.ref) {
                args.push(options.ref);
            }
        } else if (options.all) {
            args.push("--all");
        }

        if (options.prune) {
            args.push("--prune");
        }

        if (typeof options.depth === "number") {
            args.push(`--depth=${options.depth}`);
        }

        if (options.silent) {
            spawnOptions.env!["VSCODE_GIT_FETCH_SILENT"] = "true";
        }

        try {
            await this.exec(args, spawnOptions);
        } catch (err) {
            if (err instanceof GitError && /No remote repository specified\./.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoRemoteRepositorySpecified;
            } else if (err instanceof GitError && /Could not read from remote repository/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.RemoteConnectionError;
            }

            throw err;
        }
    }

    async pull(rebase?: boolean, remote?: string, branch?: string, options: PullOptions = {}): Promise<void> {
        const args = ["pull"];

        if (options.tags) {
            args.push("--tags");
        }

        if (options.unshallow) {
            args.push("--unshallow");
        }

        if (rebase) {
            args.push("-r");
        }

        if (remote && branch) {
            args.push(remote);
            args.push(branch);
        }

        try {
            await this.exec(args, {
                abortSignal: options.abortSignal,
                env: { "GIT_HTTP_USER_AGENT": this.git.userAgent },
            });
        } catch (err) {
            if (err instanceof GitError) {
                if (/^CONFLICT \([^)]+\): \b/m.test(err.stdout || "")) {
                    err.gitErrorCode = GitErrorCodes.Conflict;
                } else if (/Please tell me who you are\./.test(err.stderr || "")) {
                    err.gitErrorCode = GitErrorCodes.NoUserNameConfigured;
                } else if (/Could not read from remote repository/.test(err.stderr || "")) {
                    err.gitErrorCode = GitErrorCodes.RemoteConnectionError;
                } else if (
                    err.stderr
                    && /Pull(?:ing)? is not possible because you have unmerged files|Cannot pull with rebase: You have unstaged changes|Your local changes to the following files would be overwritten|Please, commit your changes before you can merge/i
                        .test(err.stderr)
                ) {
                    err.stderr = err.stderr.replace(
                        /Cannot pull with rebase: You have unstaged changes/i,
                        "Cannot pull with rebase, you have unstaged changes",
                    );
                    err.gitErrorCode = GitErrorCodes.DirtyWorkTree;
                } else if (/cannot lock ref|unable to update local ref/i.test(err.stderr || "")) {
                    err.gitErrorCode = GitErrorCodes.CantLockRef;
                } else if (/cannot rebase onto multiple branches/i.test(err.stderr || "")) {
                    err.gitErrorCode = GitErrorCodes.CantRebaseMultipleBranches;
                }
            }

            throw err;
        }
    }

    async rebase(branch: string, options: PullOptions = {}): Promise<void> {
        const args = ["rebase"];

        args.push(branch);

        try {
            await this.exec(args, options);
        } catch (err) {
            if (err instanceof GitError && /^CONFLICT \([^)]+\): \b/m.test(err.stdout || "")) {
                err.gitErrorCode = GitErrorCodes.Conflict;
            } else if (err instanceof GitError && /cannot rebase onto multiple branches/i.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.CantRebaseMultipleBranches;
            }

            throw err;
        }
    }

    async push(
        remote?: string,
        name?: string,
        setUpstream: boolean = false,
        followTags = false,
        forcePushMode?: ForcePushModeOptions,
        tags = false,
    ): Promise<void> {
        const args = ["push"];

        if (forcePushMode === ForcePushMode.ForceWithLease) {
            args.push("--force-with-lease");
        } else if (forcePushMode === ForcePushMode.Force) {
            args.push("--force");
        }

        if (setUpstream) {
            args.push("-u");
        }

        if (followTags) {
            args.push("--follow-tags");
        }

        if (tags) {
            args.push("--tags");
        }

        if (remote) {
            args.push(remote);
        }

        if (name) {
            args.push(name);
        }

        try {
            await this.exec(args, { env: { "GIT_HTTP_USER_AGENT": this.git.userAgent } });
        } catch (err) {
            if (err instanceof GitError) {
                if (/^error: failed to push some refs to\b/m.test(err.stderr || "")) {
                    err.gitErrorCode = GitErrorCodes.PushRejected;
                } else if (/Could not read from remote repository/.test(err.stderr || "")) {
                    err.gitErrorCode = GitErrorCodes.RemoteConnectionError;
                } else if (/^fatal: The current branch .* has no upstream branch/.test(err.stderr || "")) {
                    err.gitErrorCode = GitErrorCodes.NoUpstreamBranch;
                } else if (/Permission.*denied/.test(err.stderr || "")) {
                    err.gitErrorCode = GitErrorCodes.PermissionDenied;
                }
            }

            throw err;
        }
    }

    async cherryPick(commitHash: string): Promise<void> {
        const args = ["cherry-pick", commitHash];
        await this.exec(args);
    }

    async blame(path: string): Promise<string> {
        try {
            const args = ["blame", sanitizePath(path)];
            const result = await this.exec(args);
            return result.stdout.trim();
        } catch (err) {
            if (err instanceof GitError && /^fatal: no such path/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoPathFound;
            }

            throw err;
        }
    }

    async createStash(message?: string, includeUntracked?: boolean): Promise<void> {
        try {
            const args = ["stash", "push"];

            if (includeUntracked) {
                args.push("-u");
            }

            if (message) {
                args.push("-m", message);
            }

            await this.exec(args);
        } catch (err) {
            if (err instanceof GitError && /No local changes to save/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoLocalChanges;
            }

            throw err;
        }
    }

    async popStash(index?: number): Promise<void> {
        const args = ["stash", "pop"];
        await this.#popOrApplyStash(args, index);
    }

    async applyStash(index?: number): Promise<void> {
        const args = ["stash", "apply"];
        await this.#popOrApplyStash(args, index);
    }

    async #popOrApplyStash(args: string[], index?: number): Promise<void> {
        try {
            if (typeof index === "number") {
                args.push(`stash@{${index}}`);
            }

            await this.exec(args);
        } catch (err) {
            if (err instanceof GitError) {
                if (/No stash found/.test(err.stderr || "")) {
                    err.gitErrorCode = GitErrorCodes.NoStashFound;
                } else if (
                    /error: Your local changes to the following files would be overwritten/.test(err.stderr || "")
                ) {
                    err.gitErrorCode = GitErrorCodes.LocalChangesOverwritten;
                } else if (/^CONFLICT/m.test(err.stdout || "")) {
                    err.gitErrorCode = GitErrorCodes.StashConflict;
                }
            }

            throw err;
        }
    }

    async dropStash(index?: number): Promise<void> {
        const args = ["stash", "drop"];

        if (typeof index === "number") {
            args.push(`stash@{${index}}`);
        }

        try {
            await this.exec(args);
        } catch (err) {
            if (err instanceof GitError && /No stash found/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoStashFound;
            }

            throw err;
        }
    }

    // here
    getStatusTrackedAndMerge(
        opts?: { limit?: number; ignoreSubmodules?: boolean },
    ): Promise<{ status: IFileStatus[]; didHitLimit: boolean }> {
        return getStatusTrackedAndMerge(this.stream.bind(this), opts);
    }

    async getStatusUntracked(): Promise<string[]> {
        const result = await this.exec(["ls-files", "--others", "--exclude-standard"]);
        if (result.exitCode !== 0) {
            throw new Error("Could not find untracked files");
        }

        return result.stdout.trim().split("\n").map(f => f.trim()).filter(f => f !== "");
    }

    async getHEAD(): Promise<Ref> {
        return getHEAD(this.#git._context, this.#repositoryRoot);
    }

    async findTrackingBranches(upstreamBranch: string): Promise<Branch[]> {
        const result = await findTrackingBranches(this.#git._context, this.#repositoryRoot);
        if (isOk(result)) {
            return unwrap(result).trim().split("\n")
                .map(line => line.trim().split("\0"))
                .filter(([_, upstream]) => upstream === upstreamBranch)
                .map(([ref]) => ({ name: ref, type: RefType.Head } as Branch));
        }
        throw unwrap(result);
    }

    async getRefs(
        opts?: { sort?: "alphabetically" | "committerdate"; contains?: string; pattern?: string; count?: number },
    ): Promise<Ref[]> {
        const args = ["for-each-ref"];

        if (opts?.count) {
            args.push(`--count=${opts.count}`);
        }

        if (opts && opts.sort && opts.sort !== "alphabetically") {
            args.push("--sort", `-${opts.sort}`);
        }

        args.push("--format", "%(refname) %(objectname) %(*objectname)");

        if (opts?.pattern) {
            args.push(opts.pattern);
        }

        if (opts?.contains) {
            args.push("--contains", opts.contains);
        }

        const result = await this.exec(args);

        const fn = (line: string): Ref | null => {
            let match: RegExpExecArray | null;

            if (match = /^refs\/heads\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/.exec(line)) {
                return { commit: match[2], name: match[1], type: RefType.Head };
            } else if (match = /^refs\/remotes\/([^/]+)\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/.exec(line)) {
                return {
                    commit: match[3],
                    name: `${match[1]}/${match[2]}`,
                    remote: match[1],
                    type: RefType.RemoteHead,
                };
            } else if (match = /^refs\/tags\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/.exec(line)) {
                return { commit: match[3] ?? match[2], name: match[1], type: RefType.Tag };
            }

            return null;
        };

        return result.stdout.split("\n")
            .filter(line => !!line)
            .map(fn)
            .filter(ref => !!ref) as Ref[];
    }

    async getStashes(): Promise<Stash[]> {
        const result = await this.exec(["stash", "list"]);
        const regex = /^stash@{(\d+)}:(.+)$/;
        const rawStashes = result.stdout.trim().split("\n")
            .filter(b => !!b)
            .map(line => regex.exec(line) as RegExpExecArray)
            .filter(g => !!g)
            .map(([, index, description]: RegExpExecArray) => ({ description, index: parseInt(index) }));

        return rawStashes;
    }

    async getRemotes(): Promise<Remote[]> {
        const result = await getRemotes(this.#git._context, this.#repositoryRoot);

        if (isOk(result)) {
            const data = unwrap(result);
            const lines = data.trim().split("\n").filter(l => !!l);
            const remotes: MutableRemote[] = [];

            for (const line of lines) {
                const parts = line.split(/\s/);
                const [name, url, type] = parts;

                let remote = remotes.find(r => r.name === name);

                if (!remote) {
                    remote = { isReadOnly: false, name };
                    remotes.push(remote);
                }

                if (/fetch/i.test(type)) {
                    remote.fetchUrl = url;
                } else if (/push/i.test(type)) {
                    remote.pushUrl = url;
                } else {
                    remote.fetchUrl = url;
                    remote.pushUrl = url;
                }

                // https://github.com/microsoft/vscode/issues/45271
                remote.isReadOnly = remote.pushUrl === undefined || remote.pushUrl === "no_push";
            }

            return remotes;
        }

        throw unwrap(result);
    }

    async getBranch(name: string): Promise<Branch> {
        if (name === "HEAD") {
            return this.getHEAD();
        }

        const args = ["for-each-ref"];

        let supportsAheadBehind = true;
        if (this.#git.compareGitVersionTo("1.9.0") === -1) {
            args.push("--format=%(refname)%00%(upstream:short)%00%(objectname)");
            supportsAheadBehind = false;
        } else {
            args.push("--format=%(refname)%00%(upstream:short)%00%(objectname)%00%(upstream:track)");
        }

        if (/^refs\/(head|remotes)\//i.test(name)) {
            args.push(name);
        } else {
            args.push(`refs/heads/${name}`, `refs/remotes/${name}`);
        }

        const result = await this.exec(args);
        const branches: Branch[] = result.stdout.trim().split("\n").map<Branch | undefined>(line => {
            let [branchName, upstream, ref, status] = line.trim().split("\0");

            if (branchName.startsWith("refs/heads/")) {
                branchName = branchName.substring(11);
                const index = upstream.indexOf("/");

                let ahead;
                let behind;
                const match = /\[(?:ahead ([0-9]+))?[,\s]*(?:behind ([0-9]+))?]|\[gone]/.exec(status);
                if (match) {
                    [, ahead, behind] = match;
                }

                return {
                    ahead: Number(ahead) || 0,
                    behind: Number(behind) || 0,
                    commit: ref || undefined,
                    name: branchName,
                    type: RefType.Head,
                    upstream: upstream
                        ? {
                            name: upstream.substring(index + 1),
                            remote: upstream.substring(0, index),
                        }
                        : undefined,
                };
            } else if (branchName.startsWith("refs/remotes/")) {
                branchName = branchName.substring(13);
                const index = branchName.indexOf("/");

                return {
                    commit: ref,
                    name: branchName.substring(index + 1),
                    remote: branchName.substring(0, index),
                    type: RefType.RemoteHead,
                };
            } else {
                return undefined;
            }
        }).filter((b?: Branch): b is Branch => !!b);

        if (branches.length) {
            const [branch] = branches;

            if (!supportsAheadBehind && branch.upstream) {
                try {
                    const result = await this.exec([
                        "rev-list",
                        "--left-right",
                        "--count",
                        `${branch.name}...${branch.upstream.remote}/${branch.upstream.name}`,
                    ]);
                    const [ahead, behind] = result.stdout.trim().split("\t");

                    // TODO Anti-pattern, overriding types
                    (branch as any).ahead = Number(ahead) || 0;
                    (branch as any).behind = Number(behind) || 0;
                } catch {}
            }

            return branch;
        }

        return Promise.reject<Branch>(new Error("No such branch"));
    }

    async getBranches(query: BranchQuery): Promise<Ref[]> {
        const refs = await this.getRefs({
            contains: query.contains,
            count: query.count,
            pattern: query.pattern ? `refs/${query.pattern}` : undefined,
        });
        return refs.filter(value => (value.type !== RefType.Tag) && (query.remote || !value.remote));
    }

    async getSquashMessage(): Promise<string | undefined> {
        const squashMsgPath = path.join(this.#repositoryRoot, ".git", "SQUASH_MSG");

        try {
            const raw = await fs.readFile(squashMsgPath, "utf8");
            return stripCommitMessageComments(raw);
        } catch {
            return undefined;
        }
    }

    async getMergeMessage(): Promise<string | undefined> {
        const mergeMsgPath = path.join(this.#repositoryRoot, ".git", "MERGE_MSG");

        try {
            const raw = await fs.readFile(mergeMsgPath, "utf8");
            return stripCommitMessageComments(raw);
        } catch {
            return undefined;
        }
    }

    async getCommitTemplate(): Promise<string> {
        try {
            const result = await this.exec(["config", "--get", "commit.template"]);

            if (!result.stdout) {
                return "";
            }

            // https://github.com/git/git/blob/3a0f269e7c82aa3a87323cb7ae04ac5f129f036b/path.c#L612
            const homedir = os.homedir();
            let templatePath = result.stdout.trim()
                .replace(/^~([^\/]*)\//, (_, user) => `${user ? path.join(path.dirname(homedir), user) : homedir}/`);

            if (!path.isAbsolute(templatePath)) {
                templatePath = path.join(this.#repositoryRoot, templatePath);
            }

            const raw = await fs.readFile(templatePath, "utf8");
            return stripCommitMessageComments(raw);
        } catch (err) {
            return "";
        }
    }

    async getCommit(ref: string): Promise<Commit> {
        const result = await this.exec(["show", "-s", `--format=${COMMIT_FORMAT}`, "-z", ref]);
        const commits = parseGitCommits(result.stdout);
        if (commits.length === 0) {
            return Promise.reject<Commit>("bad commit format");
        }
        return commits[0];
    }

    async updateSubmodules(paths: string[]): Promise<void> {
        const args = ["submodule", "update"];

        for (const chunk of splitInChunks(paths.map(sanitizePath), MAX_CLI_LENGTH)) {
            await this.exec([...args, "--", ...chunk]);
        }
    }

    async getSubmodules(): Promise<Submodule[]> {
        const gitmodulesPath = path.join(this.root, ".gitmodules");

        try {
            const gitmodulesRaw = await fs.readFile(gitmodulesPath, "utf8");
            return parseGitmodules(gitmodulesRaw);
        } catch (err) {
            if (err instanceof Error && /ENOENT/.test(err.message)) {
                return [];
            }

            throw err;
        }
    }
}

// TODO: Support core.commentChar
function stripCommitMessageComments(message: string): string {
    return message.replace(/^\s*#.*$\n?/gm, "").trim();
}
