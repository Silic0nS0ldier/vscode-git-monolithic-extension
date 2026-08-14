import { clean as gitClean } from "monolithic-git-interop/api/clean/mod";
import { branch as branchDetail } from "monolithic-git-interop/api/for-each-ref/branch";
import { list as listRefs, type RefKind } from "monolithic-git-interop/api/for-each-ref/list";
import { log as gitLog } from "monolithic-git-interop/api/log/mod";
import { lsFiles, type LsFilesEntry } from "monolithic-git-interop/api/ls-files/list";
import { lsTree, type LsTreeEntry } from "monolithic-git-interop/api/ls-tree/list";
import { findTrackingBranches } from "monolithic-git-interop/api/repository/find-tracking-branches";
import { init } from "monolithic-git-interop/api/repository/init";
import { get as getRemotes } from "monolithic-git-interop/api/repository/remotes/get";
import { gitDir } from "monolithic-git-interop/api/rev-parse/git-dir";
import { showToplevel } from "monolithic-git-interop/api/rev-parse/show-toplevel";
import { commit as showCommit, show } from "monolithic-git-interop/api/show";
import { list as listStashes } from "monolithic-git-interop/api/stash/list";
import { type IFileStatus, tracked } from "monolithic-git-interop/api/status/tracked";
import { untracked } from "monolithic-git-interop/api/status/untracked";
import type { GitContext } from "monolithic-git-interop/cli";
import * as gitErrors from "monolithic-git-interop/errors";
import { unwrapOk } from "monolithic-git-interop/errors";
import type { AllServices } from "monolithic-git-interop/services";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isErr, isOk, unwrap } from "monolithic-git-interop/util/result";
import type * as cp from "node:child_process";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { OutputChannel, Progress } from "vscode";
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
    type RefTypeOptions,
    type Remote,
} from "./api/git.js";
import type { Commit } from "./git/Commit.js";
import { GitError } from "./git/error.js";
import { exec, type IExecutionResult } from "./git/exec.js";
import { diffBetween, diffIndexWith, diffIndexWithHEAD, diffWith, diffWithHEAD } from "./git/git-class/diff.js";
import { internalExec } from "./git/git-class/internal-exec.js";
import { internalSpawn } from "./git/git-class/internal-spawn.js";
import { sanitizePath } from "./git/helpers.js";
import { parseGitmodules } from "./git/parseGitmodules.js";
import { getHEAD } from "./git/repository-class/get-head.js";
import type { SpawnOptions } from "./git/SpawnOptions.js";
import type { Stash } from "./git/Stash.js";
import type { Submodule } from "./git/Submodule.js";
import { getAllConfig, getConfig, setConfig } from "./repository/repository-class/config.js";
import { splitInChunks } from "./util.js";
import { isExpectedError } from "./util/is-expected-error.js";

// https://github.com/microsoft/vscode/issues/65693
const MAX_CLI_LENGTH = 30000;

interface MutableRemote extends Remote {
    fetchUrl?: string;
    pushUrl?: string;
    isReadOnly: boolean;
}

interface IGitOptions {
    gitPath: string;
    userAgent: string;
    version: string;
    context: GitContext;
    env?: { [key: string]: string };
    outputChannel: OutputChannel;
}

const REF_TYPES: Record<RefKind, RefTypeOptions> = {
    "head": RefType.Head,
    "remote-head": RefType.RemoteHead,
    "tag": RefType.Tag,
};

interface ICloneOptions {
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
        this.#services = createServices(msg => options.outputChannel.appendLine(msg));
        this.#env = options.env || {};
    }

    open(repository: string, dotGit: string): Repository {
        return new Repository(this, repository, dotGit);
    }

    async init(repository: string): Promise<void> {
        return unwrapOk(await init(this._context, repository));
    }

    async clone(url: string, options: ICloneOptions, abortSignal?: AbortSignal): Promise<string> {
        const baseFolderName = decodeURI(url).replace(/[\/]+$/, "").replace(/^.*[\/\\]/, "").replace(/\.git$/, "")
            || "repository";

        // Ensure the parent exists first
        await fs.mkdir(options.parentPath, { recursive: true });

        // Reserve a non-colliding folder name by atomically creating the candidate directory.
        let folderPath = "";
        for (let attempt = 0; attempt < 20; attempt++) {
            const candidate = attempt === 0
                ? baseFolderName
                : `${baseFolderName}-${attempt}`;
            folderPath = path.join(options.parentPath, candidate);
            try {
                await fs.mkdir(folderPath);
                break;
            } catch (err) {
                if ((err as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 19) {
                    throw err;
                }
            }
        }

        const onSpawn = (child: cp.ChildProcess): void => {
            if (!child.stderr) {
                return;
            }

            let totalProgress = 0;
            let previousProgress = 0;

            const onLine = (line: string): void => {
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
            };

            // `git clone --progress` uses bare `\r` (no `\n`) to redraw the
            // "Receiving objects" and "Resolving deltas" progress lines in
            // place, so we split on any of `\r\n`, `\r`, or `\n`.
            child.stderr.setEncoding("utf8");
            let buffer = "";
            child.stderr.on("data", (chunk: string) => {
                buffer += chunk;
                const parts = buffer.split(/\r\n|[\r\n]/);
                buffer = parts.pop() ?? "";
                for (const line of parts) if (line.length > 0) onLine(line);
            });
            child.stderr.on("end", () => {
                if (buffer.length > 0) onLine(buffer);
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
            // Best-effort cleanup of the directory we reserved.
            // If clone failed without cleaning up, we leave it for investigation.
            try {
                await fs.rmdir(folderPath);
            } catch {
                // Swallow: surfacing this would mask the real clone failure.
            }

            if (err instanceof GitError && err.stderr) {
                err.stderr = err.stderr.replace(/^Cloning.+$/m, "").trim();
                err.stderr = err.stderr.replace(/^ERROR:\s+/, "").trim();
            }

            throw err;
        }

        return folderPath;
    }

    async getRepositoryRoot(repositoryPath: string): Promise<string> {
        return unwrapOk(await showToplevel(this._context, repositoryPath, this.#services));
    }

    async getRepositoryDotGit(repositoryPath: string): Promise<string> {
        return unwrapOk(await gitDir(this._context, repositoryPath));
    }

    async exec(cwd: string, args: string[], options: SpawnOptions = {}): Promise<IExecutionResult<string>> {
        return await this.#exec(args, { cwd, ...options, log_mode: "buffer" });
    }

    stream(cwd: string, args: string[], options: SpawnOptions = {}): cp.ChildProcess {
        return internalSpawn(this.path, this.#env, this.#log.bind(this), args, { cwd, ...options, log_mode: "stream" });
    }

    async #exec(args: string[], options: SpawnOptions): Promise<IExecutionResult<string>> {
        return internalExec(this.path, this.#env, this.#log.bind(this), args, options);
    }

    #log(output: string): void {
        this.#onOutputEmitter.emit("log", output);
    }

    // For repository abstraction
    // TODO Give `Repository` it's own logger
    log(output: string) {
        this.#log(output);
    }
}

interface PullOptions {
    unshallow?: boolean;
    tags?: boolean;
    readonly abortSignal?: AbortSignal;
}

let runCounter = 0;

// TODO All logic here needs to be split across the following locations;
// - extension/src/repository/repository-class/mod.ts (business logic)
// - monolithic-git-interop (git interactions)
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

    async config(key: string, value: string): Promise<void> {
        return await setConfig(this, key, value);
    }

    async getConfigs(): Promise<{ key: string; value: string }[]> {
        return await getAllConfig(this);
    }

    async log(options?: LogOptions): Promise<Commit[]> {
        const result = await gitLog(this.#git._context, this.#repositoryRoot, options);
        if (isErr(result)) {
            const error = unwrap(result);
            if (error.type === gitErrors.ERROR_NON_ZERO_EXIT) {
                // An empty repo
                return [];
            }
            throw error._error;
        }
        return unwrap(result);
    }

    async buffer(object: string): Promise<Buffer> {
        const result = await show(this.#git._context, this.#repositoryRoot, object);

        if (isErr(result)) {
            const error = unwrap(result);
            const details = error.type === gitErrors.ERROR_NON_ZERO_EXIT ? error.cause : undefined;
            const gitError = new GitError({
                exitCode: details?.exitCode ?? undefined,
                message: "Could not show object.",
                stderr: details?.stderr,
            });
            this.git.log(`Failed to get object ${object}: ${unwrap(result)}`);
            throw gitError;
        }

        return unwrap(result);
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

    async lstree(treeish: string, path: string): Promise<LsTreeEntry[]> {
        return unwrapOk(await lsTree(this.#git._context, this.#repositoryRoot, treeish, sanitizePath(path)));
    }

    async lsfiles(path: string): Promise<LsFilesEntry[]> {
        return unwrapOk(await lsFiles(this.#git._context, this.#repositoryRoot, sanitizePath(path)));
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
        const start = Date.now();
        const child = this.stream(["hash-object", "--stdin", "-w", "--path", sanitizePath(path)], {
            stdio: [null, null, null],
        });
        if (!child.stdin) {
            throw new Error("stdin not available");
        }
        child.stdin.end(data, "utf8");

        const pid = child.pid;
        const invocId = `CMD_3_${runCounter++}`;
        this.git.log(`${invocId} > (PID = ${pid}) ${child.spawnfile} ${child.spawnargs.join(" ")}`);

        const result = await exec(child);

        const durationStr = new Intl.DurationFormat("en", { style: "narrow" }).format({
            milliseconds: Date.now() - start,
        });

        if (isErr(result)) {
            this.git.log(`${invocId} < ERROR (PID = ${pid}; Duration = ${durationStr})`);
            throw unwrap(result);
        }

        this.git.log(`${invocId} < SUCCESS (PID = ${pid}; Duration = ${durationStr})`);
        const { exitCode, stdout } = unwrap(result);
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
            await getConfig(this, "user.name");
        } catch (err) {
            const gitErr = new GitError({}, { cause: new AggregateError([commitErr, err]) });
            gitErr.gitErrorCode = GitErrorCodes.NoUserNameConfigured;
            throw gitErr;
        }

        try {
            await getConfig(this, "user.email");
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
        unwrapOk(await gitClean(this.#git._context, this.#repositoryRoot, paths, { quiet: true }));
    }

    async undo(): Promise<void> {
        unwrapOk(await gitClean(this.#git._context, this.#repositoryRoot, [], { directories: true }));

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

    async getStatusTrackedAndMerge(
        opts?: { ignoreSubmodules?: boolean },
    ): Promise<IFileStatus[]> {
        const result = await tracked(this.#git._context, this.#repositoryRoot, "relative", opts);
        if (isOk(result)) {
            return unwrap(result);
        }
        throw new Error("Could not find tracked files", { cause: unwrap(result) });
    }

    async getStatusUntracked(): Promise<string[]> {
        const result = await untracked(this.#git._context, this.#repositoryRoot, "relative");
        if (isOk(result)) {
            return unwrap(result);
        }
        throw new Error("Could not find untracked files", { cause: unwrap(result) });
    }

    async getHEAD(): Promise<Ref> {
        return getHEAD(this.#git._context, this.#repositoryRoot);
    }

    async findTrackingBranches(upstreamBranch: string): Promise<Branch[]> {
        const result = unwrapOk(await findTrackingBranches(this.#git._context, this.#repositoryRoot));

        return result.trim().split("\n")
            .map(line => line.trim().split("\0"))
            .filter(([_, upstream]) => upstream === upstreamBranch)
            .map(([ref]) => ({ name: ref, type: RefType.Head } as Branch));
    }

    async getRefs(
        opts?: { sort?: "alphabetically" | "committerdate"; contains?: string; pattern?: string; count?: number },
    ): Promise<Ref[]> {
        const refs = unwrapOk(
            await listRefs(this.#git._context, this.#repositoryRoot, {
                contains: opts?.contains,
                count: opts?.count,
                pattern: opts?.pattern,
                sort: opts?.sort === "committerdate" ? "committerdate" : undefined,
            }),
        );

        return refs.map(ref => ({
            commit: ref.commit,
            name: ref.name,
            remote: ref.remote,
            type: REF_TYPES[ref.kind],
        }));
    }

    async getStashes(): Promise<Stash[]> {
        return unwrapOk(await listStashes(this.#git._context, this.#repositoryRoot));
    }

    async getRemotes(): Promise<Remote[]> {
        const data = unwrapOk(await getRemotes(this.#git._context, this.#repositoryRoot));

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

    async getBranch(name: string): Promise<Branch> {
        if (name === "HEAD") {
            return this.getHEAD();
        }

        const detail = unwrapOk(await branchDetail(this.#git._context, this.#repositoryRoot, name));

        if (!detail) {
            return Promise.reject<Branch>(new Error("No such branch"));
        }

        if (detail.kind === "remote-head") {
            return {
                commit: detail.commit,
                name: detail.name,
                remote: detail.remote,
                type: RefType.RemoteHead,
            };
        }

        return {
            ahead: detail.ahead,
            behind: detail.behind,
            commit: detail.commit,
            name: detail.name,
            type: RefType.Head,
            upstream: detail.upstream,
        };
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
        const commit = unwrapOk(await showCommit(this.#git._context, this.#repositoryRoot, ref));

        if (!commit) {
            return Promise.reject<Commit>("bad commit format");
        }

        return commit;
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
