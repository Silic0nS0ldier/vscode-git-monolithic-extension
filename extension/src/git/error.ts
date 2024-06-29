import { GitErrorCodes } from "../api/git.js";

export function cpErrorHandler(cb: (reason?: any) => void): (reason?: any) => void {
    return err => {
        let normalisedErr = err;
        if (/ENOENT/.test(err.message)) {
            normalisedErr = new GitError({
                error: err,
                gitErrorCode: GitErrorCodes.NotAGitRepository,
                message: "Failed to execute git (ENOENT)",
            });
        }

        cb(normalisedErr);
    };
}

export interface IGitErrorData {
    error?: Error;
    message?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    gitErrorCode?: string;
    gitCommand?: string;
    gitArgs?: string[];
}

export class GitError extends Error {
    error?: Error;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    gitErrorCode?: string;
    gitCommand?: string;
    gitArgs?: string[];
    gitTreeish?: string;

    constructor(data: IGitErrorData, options?: ErrorOptions) {
        super("", options);
        if (data.error) {
            this.error = data.error;
            this.message = data.error.message;
        } else {
            this.error = undefined;
            this.message = "";
        }

        this.message = this.message || data.message || "Git error";
        this.stdout = data.stdout;
        this.stderr = data.stderr;
        this.exitCode = data.exitCode;
        this.gitErrorCode = data.gitErrorCode;
        this.gitCommand = data.gitCommand;
        this.gitArgs = data.gitArgs;
    }

    override toString(): string {
        let result = this.message + " " + JSON.stringify(
            {
                exitCode: this.exitCode,
                gitCommand: this.gitCommand,
                gitErrorCode: this.gitErrorCode,
                stderr: this.stderr,
                stdout: this.stdout,
            },
            null,
            2,
        );

        if (this.error) {
            result += (<any> this.error).stack;
        }

        return result;
    }
}

export function getGitErrorCode(stderr: string): string | undefined {
    if (
        /Another git process seems to be running in this repository|If no other git process is currently running/.test(
            stderr,
        )
    ) {
        return GitErrorCodes.RepositoryIsLocked;
    } else if (/Authentication failed/i.test(stderr)) {
        return GitErrorCodes.AuthenticationFailed;
    } else if (/Not a git repository/i.test(stderr)) {
        return GitErrorCodes.NotAGitRepository;
    } else if (/bad config file/.test(stderr)) {
        return GitErrorCodes.BadConfigFile;
    } else if (/cannot make pipe for command substitution|cannot create standard input pipe/.test(stderr)) {
        return GitErrorCodes.CantCreatePipe;
    } else if (/Repository not found/.test(stderr)) {
        return GitErrorCodes.RepositoryNotFound;
    } else if (/unable to access/.test(stderr)) {
        return GitErrorCodes.CantAccessRemote;
    } else if (/branch '.+' is not fully merged/.test(stderr)) {
        return GitErrorCodes.BranchNotFullyMerged;
    } else if (/Couldn\'t find remote ref/.test(stderr)) {
        return GitErrorCodes.NoRemoteReference;
    } else if (/A branch named '.+' already exists/.test(stderr)) {
        return GitErrorCodes.BranchAlreadyExists;
    } else if (/'.+' is not a valid branch name/.test(stderr)) {
        return GitErrorCodes.InvalidBranchName;
    } else if (/Please,? commit your changes or stash them/.test(stderr)) {
        return GitErrorCodes.DirtyWorkTree;
    }

    return undefined;
}
