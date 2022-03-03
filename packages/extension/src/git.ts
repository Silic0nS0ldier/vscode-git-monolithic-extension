/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as iconv from "@vscode/iconv-lite-umd";
import * as byline from "byline";
import { init } from "monolithic-git-interop/api/repository/init";
import { gitDir } from "monolithic-git-interop/api/rev-parse/git-dir";
import { head } from "monolithic-git-interop/api/rev-parse/head";
import { showToplevel } from "monolithic-git-interop/api/rev-parse/show-toplevel";
import { GitContext } from "monolithic-git-interop/cli";
import { AllServices } from "monolithic-git-interop/services";
import { createServices } from "monolithic-git-interop/services/nodejs";
import { isOk, unwrap } from "monolithic-git-interop/util/result";
import * as cp from "node:child_process";
import { EventEmitter } from "node:events";
import { exists, promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { CancellationToken, Progress, Uri } from "vscode";
import {
    Branch,
    BranchQuery,
    Change,
    CommitOptions,
    ForcePushMode,
    GitErrorCodes,
    LogOptions,
    Ref,
    RefType,
    Remote,
} from "./api/git.js";
import { detectEncoding } from "./encoding.js";
import { diffBetween, diffIndexWith, diffIndexWithHEAD, diffWith, diffWithHEAD } from "./git/diff.js";
import { getGitErrorCode } from "./git/error.js";
import { cpErrorHandler, GitError } from "./git/error.js";
import { sanitizePath } from "./git/helpers.js";
import { getStatus } from "./git/status.js";
import {
    assign,
    dispose,
    groupBy,
    IDisposable,
    Limiter,
    mkdirp,
    onceEvent,
    splitInChunks,
    toDisposable,
    Versions,
} from "./util.js";

export { findGit, IGit } from "./git/find.js";

// https://github.com/microsoft/vscode/issues/65693
const MAX_CLI_LENGTH = 30000;

export interface IFileStatus {
    x: string;
    y: string;
    path: string;
    rename?: string;
}

export interface Stash {
    index: number;
    description: string;
}

interface MutableRemote extends Remote {
    fetchUrl?: string;
    pushUrl?: string;
    isReadOnly: boolean;
}

// TODO@eamodio: Move to git.d.ts once we are good with the api
/**
 * Log file options.
 */
export interface LogFileOptions {
    /** Optional. The maximum number of log entries to retrieve. */
    readonly maxEntries?: number | string;
    /** Optional. The Git sha (hash) to start retrieving log entries from. */
    readonly hash?: string;
    /** Optional. Specifies whether to start retrieving log entries in reverse order. */
    readonly reverse?: boolean;
    readonly sortByAuthorDate?: boolean;
}
export interface IExecutionResult<T extends string | Buffer> {
    exitCode: number;
    stdout: T;
    stderr: string;
}

export interface SpawnOptions extends cp.SpawnOptions {
    input?: string;
    encoding?: string;
    cancellationToken?: CancellationToken;
    onSpawn?: (childProcess: cp.ChildProcess) => void;
    log_mode?: "stream" | "buffer";
}

async function exec(child: cp.ChildProcess, cancellationToken?: CancellationToken): Promise<IExecutionResult<Buffer>> {
    if (!child.stdout || !child.stderr) {
        throw new GitError({ message: "Failed to get stdout or stderr from git process." });
    }

    if (cancellationToken && cancellationToken.isCancellationRequested) {
        throw new GitError({ message: "Cancelled" });
    }

    const disposables: IDisposable[] = [];

    const once = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void) => {
        ee.once(name, fn);
        disposables.push(toDisposable(() => ee.removeListener(name, fn)));
    };

    const on = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void) => {
        ee.on(name, fn);
        disposables.push(toDisposable(() => ee.removeListener(name, fn)));
    };

    let result = Promise.all<any>([
        new Promise<number>((c, e) => {
            once(child, "error", cpErrorHandler(e));
            once(child, "exit", c);
        }),
        new Promise<Buffer>(c => {
            const buffers: Buffer[] = [];
            on(child.stdout!, "data", (b: Buffer) => buffers.push(b));
            once(child.stdout!, "close", () => c(Buffer.concat(buffers)));
        }),
        new Promise<string>(c => {
            const buffers: Buffer[] = [];
            on(child.stderr!, "data", (b: Buffer) => buffers.push(b));
            once(child.stderr!, "close", () => c(Buffer.concat(buffers).toString("utf8")));
        }),
    ]) as Promise<[number, Buffer, string]>;

    if (cancellationToken) {
        const cancellationPromise = new Promise<[number, Buffer, string]>((_, e) => {
            onceEvent(cancellationToken.onCancellationRequested)(() => {
                try {
                    child.kill();
                } catch (err) {
                    // noop
                }

                e(new GitError({ message: "Cancelled" }));
            });
        });

        result = Promise.race([result, cancellationPromise]);
    }

    try {
        const [exitCode, stdout, stderr] = await result;
        return { exitCode, stdout, stderr };
    } finally {
        dispose(disposables);
    }
}

export interface IGitOptions {
    gitPath: string;
    userAgent: string;
    version: string;
    context: GitContext;
    env?: any;
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
    readonly _context: GitContext;
    private readonly services: AllServices;
    private env: any;

    private _onOutput = new EventEmitter();
    get onOutput(): EventEmitter {
        return this._onOutput;
    }

    constructor(options: IGitOptions) {
        this.path = options.gitPath;
        this.version = options.version;
        this.userAgent = options.userAgent;
        this._context = options.context;
        this.services = createServices();
        this.env = options.env || {};
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

    async clone(url: string, options: ICloneOptions, cancellationToken?: CancellationToken): Promise<string> {
        let baseFolderName = decodeURI(url).replace(/[\/]+$/, "").replace(/^.*[\/\\]/, "").replace(/\.git$/, "")
            || "repository";
        let folderName = baseFolderName;
        let folderPath = path.join(options.parentPath, folderName);
        let count = 1;

        while (count < 20 && await new Promise(c => exists(folderPath, c))) {
            folderName = `${baseFolderName}-${count++}`;
            folderPath = path.join(options.parentPath, folderName);
        }

        await mkdirp(options.parentPath);

        const onSpawn = (child: cp.ChildProcess) => {
            const decoder = new StringDecoder("utf8");
            const lineStream = new byline.LineStream({ encoding: "utf8" });
            child.stderr!.on("data", (buffer: Buffer) => lineStream.write(decoder.write(buffer)));

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
                cancellationToken,
                env: { "GIT_HTTP_USER_AGENT": this.userAgent },
                onSpawn,
            });
        } catch (err) {
            if (err.stderr) {
                err.stderr = err.stderr.replace(/^Cloning.+$/m, "").trim();
                err.stderr = err.stderr.replace(/^ERROR:\s+/, "").trim();
            }

            throw err;
        }

        return folderPath;
    }

    async getRepositoryRoot(repositoryPath: string): Promise<string> {
        const result = await showToplevel(this._context, repositoryPath, this.services);

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
        return await this._exec(args, { cwd, ...options, log_mode: "buffer" });
    }

    async exec2(args: string[], options: SpawnOptions = {}): Promise<IExecutionResult<string>> {
        return await this._exec(args, { ...options, log_mode: "buffer" });
    }

    stream(cwd: string, args: string[], options: SpawnOptions = {}): cp.ChildProcess {
        return this.spawn(args, { cwd, ...options, log_mode: "stream" });
    }

    private async _exec(args: string[], options: SpawnOptions): Promise<IExecutionResult<string>> {
        const child = this.spawn(args, options);

        if (options.onSpawn) {
            options.onSpawn(child);
        }

        if (options.input) {
            child.stdin!.end(options.input, "utf8");
        }

        const bufferResult = await exec(child, options.cancellationToken);

        if (bufferResult.stderr.length > 0) {
            this.log(`PID_${child.pid} [${options.log_mode}] < [ERR] ${JSON.stringify(bufferResult.stderr)}\n`);
        }
        let out = JSON.stringify(bufferResult.stdout.toString("utf-8"));
        if (out.length > 150) {
            out = out.slice(0, 150) + `" (${out.length - 150} chars hidden)`;
        }
        this.log(`PID_${child.pid} [${options.log_mode}] < ${out}\n`);

        let encoding = options.encoding || "utf8";
        encoding = iconv.encodingExists(encoding) ? encoding : "utf8";

        const result: IExecutionResult<string> = {
            exitCode: bufferResult.exitCode,
            stdout: iconv.decode(bufferResult.stdout, encoding),
            stderr: bufferResult.stderr,
        };

        if (bufferResult.exitCode) {
            return Promise.reject<IExecutionResult<string>>(
                new GitError({
                    message: "Failed to execute git",
                    stdout: result.stdout,
                    stderr: result.stderr,
                    exitCode: result.exitCode,
                    gitErrorCode: getGitErrorCode(result.stderr),
                    gitCommand: args[0],
                    gitArgs: args,
                }),
            );
        }

        return result;
    }

    spawn(args: string[], options: SpawnOptions = {}): cp.ChildProcess {
        if (!this.path) {
            throw new Error("git could not be found in the system.");
        }

        if (!options.stdio && !options.input) {
            options.stdio = ["ignore", null, null]; // Unless provided, ignore stdin and leave default streams for stdout and stderr
        }

        options.env = assign({}, process.env, this.env, options.env || {}, {
            VSCODE_GIT_COMMAND: args[0],
            LC_ALL: "en_US.UTF-8",
            LANG: "en_US.UTF-8",
            GIT_PAGER: "cat",
        });

        if (options.cwd) {
            options.cwd = sanitizePath(options.cwd);
        }

        const cmd = `git ${args.join(" ")}`;
        try {
            const child = cp.spawn(this.path, args, options);
            this.log(`PID_${child.pid} [${options.log_mode}] > ${cmd}\n`);
            return child;
        } catch (e) {
            this.log(`LAUNCH_FAILED > ${cmd}`);
            throw e;
        }
    }

    private log(output: string): void {
        this._onOutput.emit("log", output);
    }
}

export interface Commit {
    hash: string;
    message: string;
    parents: string[];
    authorDate?: Date;
    authorName?: string;
    authorEmail?: string;
    commitDate?: Date;
}

export interface Submodule {
    name: string;
    path: string;
    url: string;
}

export function parseGitmodules(raw: string): Submodule[] {
    const regex = /\r?\n/g;
    let position = 0;
    let match: RegExpExecArray | null = null;

    const result: Submodule[] = [];
    let submodule: Partial<Submodule> = {};

    function parseLine(line: string): void {
        const sectionMatch = /^\s*\[submodule "([^"]+)"\]\s*$/.exec(line);

        if (sectionMatch) {
            if (submodule.name && submodule.path && submodule.url) {
                result.push(submodule as Submodule);
            }

            const name = sectionMatch[1];

            if (name) {
                submodule = { name };
                return;
            }
        }

        if (!submodule) {
            return;
        }

        const propertyMatch = /^\s*(\w+)\s*=\s*(.*)$/.exec(line);

        if (!propertyMatch) {
            return;
        }

        const [, key, value] = propertyMatch;

        switch (key) {
            case "path":
                submodule.path = value;
                break;
            case "url":
                submodule.url = value;
                break;
        }
    }

    while (match = regex.exec(raw)) {
        parseLine(raw.substring(position, match.index));
        position = match.index + match[0].length;
    }

    parseLine(raw.substring(position));

    if (submodule.name && submodule.path && submodule.url) {
        result.push(submodule as Submodule);
    }

    return result;
}

const commitRegex = /([0-9a-f]{40})\n(.*)\n(.*)\n(.*)\n(.*)\n(.*)(?:\n([^]*?))?(?:\x00)/gm;

export function parseGitCommits(data: string): Commit[] {
    let commits: Commit[] = [];

    let ref;
    let authorName;
    let authorEmail;
    let authorDate;
    let commitDate;
    let parents;
    let message;
    let match;

    do {
        match = commitRegex.exec(data);
        if (match === null) {
            break;
        }

        [, ref, authorName, authorEmail, authorDate, commitDate, parents, message] = match;

        if (message[message.length - 1] === "\n") {
            message = message.substr(0, message.length - 1);
        }

        // Stop excessive memory usage by using substr -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
        commits.push({
            hash: ` ${ref}`.substr(1),
            message: ` ${message}`.substr(1),
            parents: parents ? parents.split(" ") : [],
            authorDate: new Date(Number(authorDate) * 1000),
            authorName: ` ${authorName}`.substr(1),
            authorEmail: ` ${authorEmail}`.substr(1),
            commitDate: new Date(Number(commitDate) * 1000),
        });
    } while (true);

    return commits;
}

interface LsTreeElement {
    mode: string;
    type: string;
    object: string;
    size: string;
    file: string;
}

export function parseLsTree(raw: string): LsTreeElement[] {
    return raw.split("\n")
        .filter(l => !!l)
        .map(line => /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line)!)
        .filter(m => !!m)
        .map(([, mode, type, object, size, file]) => ({ mode, type, object, size, file }));
}

interface LsFilesElement {
    mode: string;
    object: string;
    stage: string;
    file: string;
}

export function parseLsFiles(raw: string): LsFilesElement[] {
    return raw.split("\n")
        .filter(l => !!l)
        .map(line => /^(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/.exec(line)!)
        .filter(m => !!m)
        .map(([, mode, object, stage, file]) => ({ mode, object, stage, file }));
}

export interface PullOptions {
    unshallow?: boolean;
    tags?: boolean;
    readonly cancellationToken?: CancellationToken;
}

export class Repository {
    constructor(
        private _git: Git,
        private repositoryRoot: string,
        readonly dotGit: string,
    ) {}

    get git(): Git {
        return this._git;
    }

    get root(): string {
        return this.repositoryRoot;
    }

    async exec(args: string[], options: SpawnOptions = {}): Promise<IExecutionResult<string>> {
        return await this.git.exec(this.repositoryRoot, args, options);
    }

    stream(args: string[], options: SpawnOptions = {}): cp.ChildProcess {
        return this.git.stream(this.repositoryRoot, args, options);
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

    async bufferString(object: string, encoding: string = "utf8", autoGuessEncoding = false): Promise<string> {
        const stdout = await this.buffer(object);

        let normalisedEncoding = encoding;
        if (autoGuessEncoding) {
            normalisedEncoding = detectEncoding(stdout) || normalisedEncoding;
        }

        normalisedEncoding = iconv.encodingExists(normalisedEncoding) ? normalisedEncoding : "utf8";

        return iconv.decode(stdout, normalisedEncoding);
    }

    async buffer(object: string): Promise<Buffer> {
        const child = this.stream(["show", "--textconv", object]);

        if (!child.stdout) {
            return Promise.reject<Buffer>("Can't open file from git");
        }

        const { exitCode, stdout, stderr } = await exec(child);

        if (exitCode) {
            const err = new GitError({
                message: "Could not show object.",
                exitCode,
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
                throw new GitError({ message: "Path not known by git", gitErrorCode: GitErrorCodes.UnknownPath });
            }

            const { mode, object } = elements[0];
            const catFile = await this.exec(["cat-file", "-s", object]);
            const size = parseInt(catFile.stdout);

            return { mode, object, size };
        }

        const elements = await this.lstree(treeish, path);

        if (elements.length === 0) {
            throw new GitError({ message: "Path not known by git", gitErrorCode: GitErrorCodes.UnknownPath });
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
            if (/patch does not apply/.test(err.stderr)) {
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
                repositoryRoot: this.repositoryRoot,
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
                repositoryRoot: this.repositoryRoot,
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
                repositoryRoot: this.repositoryRoot,
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
                repositoryRoot: this.repositoryRoot,
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
                repositoryRoot: this.repositoryRoot,
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
        child.stdin!.end(data, "utf8");

        const { exitCode, stdout } = await exec(child);
        const hash = stdout.toString("utf8");

        if (exitCode) {
            throw new GitError({
                message: "Could not hash object.",
                exitCode: exitCode,
            });
        }

        const treeish = await this.getCommit("HEAD").then(() => "HEAD", () => "");
        let mode: string;
        let add: string = "";

        try {
            const details = await this.getObjectDetails(treeish, path);
            mode = details.mode;
        } catch (err) {
            if (err.gitErrorCode !== GitErrorCodes.UnknownPath) {
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
            if (/Please,? commit your changes or stash them/.test(err.stderr || "")) {
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
            await this.handleCommitError(commitErr);
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
            await this.handleCommitError(commitErr);
        }
    }

    private async handleCommitError(commitErr: any): Promise<void> {
        if (/not possible because you have unmerged files/.test(commitErr.stderr || "")) {
            commitErr.gitErrorCode = GitErrorCodes.UnmergedChanges;
            throw commitErr;
        }

        try {
            await this.exec(["config", "--get-all", "user.name"]);
        } catch (err) {
            err.gitErrorCode = GitErrorCodes.NoUserNameConfigured;
            throw err;
        }

        try {
            await this.exec(["config", "--get-all", "user.email"]);
        } catch (err) {
            err.gitErrorCode = GitErrorCodes.NoUserEmailConfigured;
            throw err;
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
            if (/^CONFLICT /m.test(err.stdout || "")) {
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
        const pathsByGroup = groupBy(paths.map(sanitizePath), p => path.dirname(p));
        const groups = Object.keys(pathsByGroup).map(k => pathsByGroup[k]);

        const limiter = new Limiter(5);
        const promises: Promise<any>[] = [];
        const args = ["clean", "-f", "-q"];

        for (const paths of groups) {
            for (const chunk of splitInChunks(paths.map(sanitizePath), MAX_CLI_LENGTH)) {
                promises.push(limiter.queue(() => this.exec([...args, "--", ...chunk])));
            }
        }

        await Promise.all(promises);
    }

    async undo(): Promise<void> {
        await this.exec(["clean", "-fd"]);

        try {
            await this.exec(["checkout", "--", "."]);
        } catch (err) {
            if (/did not match any file\(s\) known to git\./.test(err.stderr || "")) {
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
            if (/([^:]+: needs merge\n)+/m.test(err.stdout || "")) {
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
            readonly cancellationToken?: CancellationToken;
        } = {},
    ): Promise<void> {
        const args = ["fetch"];
        const spawnOptions: SpawnOptions = {
            cancellationToken: options.cancellationToken,
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
            if (/No remote repository specified\./.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoRemoteRepositorySpecified;
            } else if (/Could not read from remote repository/.test(err.stderr || "")) {
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
                cancellationToken: options.cancellationToken,
                env: { "GIT_HTTP_USER_AGENT": this.git.userAgent },
            });
        } catch (err) {
            if (/^CONFLICT \([^)]+\): \b/m.test(err.stdout || "")) {
                err.gitErrorCode = GitErrorCodes.Conflict;
            } else if (/Please tell me who you are\./.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoUserNameConfigured;
            } else if (/Could not read from remote repository/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.RemoteConnectionError;
            } else if (
                /Pull(?:ing)? is not possible because you have unmerged files|Cannot pull with rebase: You have unstaged changes|Your local changes to the following files would be overwritten|Please, commit your changes before you can merge/i
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

            throw err;
        }
    }

    async rebase(branch: string, options: PullOptions = {}): Promise<void> {
        const args = ["rebase"];

        args.push(branch);

        try {
            await this.exec(args, options);
        } catch (err) {
            if (/^CONFLICT \([^)]+\): \b/m.test(err.stdout || "")) {
                err.gitErrorCode = GitErrorCodes.Conflict;
            } else if (/cannot rebase onto multiple branches/i.test(err.stderr || "")) {
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
        forcePushMode?: ForcePushMode,
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
            if (/^error: failed to push some refs to\b/m.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.PushRejected;
            } else if (/Could not read from remote repository/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.RemoteConnectionError;
            } else if (/^fatal: The current branch .* has no upstream branch/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoUpstreamBranch;
            } else if (/Permission.*denied/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.PermissionDenied;
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
            if (/^fatal: no such path/.test(err.stderr || "")) {
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
            if (/No local changes to save/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoLocalChanges;
            }

            throw err;
        }
    }

    async popStash(index?: number): Promise<void> {
        const args = ["stash", "pop"];
        await this.popOrApplyStash(args, index);
    }

    async applyStash(index?: number): Promise<void> {
        const args = ["stash", "apply"];
        await this.popOrApplyStash(args, index);
    }

    private async popOrApplyStash(args: string[], index?: number): Promise<void> {
        try {
            if (typeof index === "number") {
                args.push(`stash@{${index}}`);
            }

            await this.exec(args);
        } catch (err) {
            if (/No stash found/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoStashFound;
            } else if (/error: Your local changes to the following files would be overwritten/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.LocalChangesOverwritten;
            } else if (/^CONFLICT/m.test(err.stdout || "")) {
                err.gitErrorCode = GitErrorCodes.StashConflict;
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
            if (/No stash found/.test(err.stderr || "")) {
                err.gitErrorCode = GitErrorCodes.NoStashFound;
            }

            throw err;
        }
    }

    getStatus(
        opts?: { limit?: number; ignoreSubmodules?: boolean },
    ): Promise<{ status: IFileStatus[]; didHitLimit: boolean }> {
        return getStatus(this.stream.bind(this), opts);
    }

    async getHEAD(): Promise<Ref> {
        try {
            const result = await this.exec(["symbolic-ref", "--short", "HEAD"]);

            if (!result.stdout) {
                throw new Error("Not in a branch");
            }

            return { name: result.stdout.trim(), commit: undefined, type: RefType.Head };
        } catch (err) {
            const result = await head(this._git._context, this.repositoryRoot);

            if (isOk(result)) {
                const commitMaybe = unwrap(result);
                if (commitMaybe === undefined) {
                    throw new Error("Error parsing HEAD");
                }
                return { name: undefined, commit: commitMaybe, type: RefType.Head };
            }

            throw unwrap(result);
        }
    }

    async findTrackingBranches(upstreamBranch: string): Promise<Branch[]> {
        const result = await this.exec([
            "for-each-ref",
            "--format",
            "%(refname:short)%00%(upstream:short)",
            "refs/heads",
        ]);
        return result.stdout.trim().split("\n")
            .map(line => line.trim().split("\0"))
            .filter(([_, upstream]) => upstream === upstreamBranch)
            .map(([ref]) => ({ name: ref, type: RefType.Head } as Branch));
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
                return { name: match[1], commit: match[2], type: RefType.Head };
            } else if (match = /^refs\/remotes\/([^/]+)\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/.exec(line)) {
                return {
                    name: `${match[1]}/${match[2]}`,
                    commit: match[3],
                    type: RefType.RemoteHead,
                    remote: match[1],
                };
            } else if (match = /^refs\/tags\/([^ ]+) ([0-9a-f]{40}) ([0-9a-f]{40})?$/.exec(line)) {
                return { name: match[1], commit: match[3] ?? match[2], type: RefType.Tag };
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
            .map(([, index, description]: RegExpExecArray) => ({ index: parseInt(index), description }));

        return rawStashes;
    }

    async getRemotes(): Promise<Remote[]> {
        const result = await this.exec(["remote", "--verbose"]);
        const lines = result.stdout.trim().split("\n").filter(l => !!l);
        const remotes: MutableRemote[] = [];

        for (const line of lines) {
            const parts = line.split(/\s/);
            const [name, url, type] = parts;

            let remote = remotes.find(r => r.name === name);

            if (!remote) {
                remote = { name, isReadOnly: false };
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

        const args = ["for-each-ref"];

        let supportsAheadBehind = true;
        if (this._git.compareGitVersionTo("1.9.0") === -1) {
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
                    type: RefType.Head,
                    name: branchName,
                    upstream: upstream
                        ? {
                            name: upstream.substring(index + 1),
                            remote: upstream.substring(0, index),
                        }
                        : undefined,
                    commit: ref || undefined,
                    ahead: Number(ahead) || 0,
                    behind: Number(behind) || 0,
                };
            } else if (branchName.startsWith("refs/remotes/")) {
                branchName = branchName.substring(13);
                const index = branchName.indexOf("/");

                return {
                    type: RefType.RemoteHead,
                    name: branchName.substring(index + 1),
                    remote: branchName.substring(0, index),
                    commit: ref,
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
            pattern: query.pattern ? `refs/${query.pattern}` : undefined,
            count: query.count,
        });
        return refs.filter(value => (value.type !== RefType.Tag) && (query.remote || !value.remote));
    }

    async getSquashMessage(): Promise<string | undefined> {
        const squashMsgPath = path.join(this.repositoryRoot, ".git", "SQUASH_MSG");

        try {
            const raw = await fs.readFile(squashMsgPath, "utf8");
            return stripCommitMessageComments(raw);
        } catch {
            return undefined;
        }
    }

    async getMergeMessage(): Promise<string | undefined> {
        const mergeMsgPath = path.join(this.repositoryRoot, ".git", "MERGE_MSG");

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
                templatePath = path.join(this.repositoryRoot, templatePath);
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
            if (/ENOENT/.test(err.message)) {
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
