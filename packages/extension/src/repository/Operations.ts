export function isReadOnly(operation: OperationOptions): boolean {
    switch (operation) {
        case Operation.Blame:
        case Operation.CheckIgnore:
        case Operation.Diff:
        case Operation.FindTrackingBranches:
        case Operation.GetBranch:
        case Operation.GetCommitTemplate:
        case Operation.GetObjectDetails:
        case Operation.Log:
        case Operation.LogFile:
        case Operation.MergeBase:
        case Operation.Show:
            return true;
        default:
            return false;
    }
}

function shouldShowProgress(operation: OperationOptions): boolean {
    switch (operation) {
        case Operation.Fetch:
        case Operation.CheckIgnore:
        case Operation.GetObjectDetails:
        case Operation.Show:
            return false;
        default:
            return true;
    }
}

export type OperationOptions =
    | "Add"
    | "Apply"
    | "Blame"
    | "Branch"
    | "CheckIgnore"
    | "Checkout"
    | "CheckoutTracking"
    | "CherryPick"
    | "Clean"
    | "Commit"
    | "Config"
    | "DeleteBranch"
    | "DeleteRef"
    | "DeleteTag"
    | "Diff"
    | "Fetch"
    | "FindTrackingBranches"
    | "GetBranch"
    | "GetBranches"
    | "GetCommitTemplate"
    | "GetObjectDetails"
    | "HashObject"
    | "Ignore"
    | "Log"
    | "LogFile"
    | "Merge"
    | "MergeBase"
    | "Move"
    | "Pull"
    | "Push"
    | "Rebase"
    | "RebaseAbort"
    | "RebaseContinue"
    | "Remote"
    | "Remove"
    | "RenameBranch"
    | "Reset"
    | "RevertFiles"
    | "SetBranchUpstream"
    | "Show"
    | "Stage"
    | "Stash"
    | "Status"
    | "SubmoduleUpdate"
    | "Sync"
    | "Tag";
export const Operation: Record<OperationOptions, OperationOptions> = {
    Add: "Add",
    Apply: "Apply",
    Blame: "Blame",
    Branch: "Branch",
    CheckIgnore: "CheckIgnore",
    Checkout: "Checkout",
    CheckoutTracking: "CheckoutTracking",
    CherryPick: "CherryPick",
    Clean: "Clean",
    Commit: "Commit",
    Config: "Config",
    DeleteBranch: "DeleteBranch",
    DeleteRef: "DeleteRef",
    DeleteTag: "DeleteTag",
    Diff: "Diff",
    Fetch: "Fetch",
    FindTrackingBranches: "FindTrackingBranches",
    GetBranch: "GetBranch",
    GetBranches: "GetBranches",
    GetCommitTemplate: "GetCommitTemplate",
    GetObjectDetails: "GetObjectDetails",
    HashObject: "HashObject",
    Ignore: "Ignore",
    Log: "Log",
    LogFile: "LogFile",
    Merge: "Merge",
    MergeBase: "MergeBase",
    Move: "Move",
    Pull: "Pull",
    Push: "Push",
    Rebase: "Rebase",
    RebaseAbort: "RebaseAbort",
    RebaseContinue: "RebaseContinue",
    Remote: "Remote",
    Remove: "Remove",
    RenameBranch: "RenameBranch",
    Reset: "Reset",
    RevertFiles: "RevertFiles",
    SetBranchUpstream: "SetBranchUpstream",
    Show: "Show",
    Stage: "Stage",
    Stash: "Stash",
    Status: "Status",
    SubmoduleUpdate: "SubmoduleUpdate",
    Sync: "Sync",
    Tag: "Tag",
};

export interface Operations {
    isIdle(): boolean;
    shouldShowProgress(): boolean;
    isRunning(operation: OperationOptions): boolean;
}

export class OperationsImpl implements Operations {
    #operations = new Map<OperationOptions, number>();

    start(operation: OperationOptions): void {
        this.#operations.set(operation, (this.#operations.get(operation) || 0) + 1);
    }

    end(operation: OperationOptions): void {
        const count = (this.#operations.get(operation) || 0) - 1;

        if (count <= 0) {
            this.#operations.delete(operation);
        } else {
            this.#operations.set(operation, count);
        }
    }

    isRunning(operation: OperationOptions): boolean {
        return this.#operations.has(operation);
    }

    isIdle(): boolean {
        const operations = this.#operations.keys();

        for (const operation of operations) {
            if (!isReadOnly(operation)) {
                return false;
            }
        }

        return true;
    }

    shouldShowProgress(): boolean {
        const operations = this.#operations.keys();

        for (const operation of operations) {
            if (shouldShowProgress(operation)) {
                return true;
            }
        }

        return false;
    }
}
