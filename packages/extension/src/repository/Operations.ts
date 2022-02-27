import { isReadOnly } from "./isReadOnly.js";
import { shouldShowProgress } from "./shouldShowProgress.js";

export const enum Operation {
    Status = "Status",
    Config = "Config",
    Diff = "Diff",
    MergeBase = "MergeBase",
    Add = "Add",
    Remove = "Remove",
    RevertFiles = "RevertFiles",
    Commit = "Commit",
    Clean = "Clean",
    Branch = "Branch",
    GetBranch = "GetBranch",
    GetBranches = "GetBranches",
    SetBranchUpstream = "SetBranchUpstream",
    HashObject = "HashObject",
    Checkout = "Checkout",
    CheckoutTracking = "CheckoutTracking",
    Reset = "Reset",
    Remote = "Remote",
    Fetch = "Fetch",
    Pull = "Pull",
    Push = "Push",
    CherryPick = "CherryPick",
    Sync = "Sync",
    Show = "Show",
    Stage = "Stage",
    GetCommitTemplate = "GetCommitTemplate",
    DeleteBranch = "DeleteBranch",
    RenameBranch = "RenameBranch",
    DeleteRef = "DeleteRef",
    Merge = "Merge",
    Rebase = "Rebase",
    Ignore = "Ignore",
    Tag = "Tag",
    DeleteTag = "DeleteTag",
    Stash = "Stash",
    CheckIgnore = "CheckIgnore",
    GetObjectDetails = "GetObjectDetails",
    SubmoduleUpdate = "SubmoduleUpdate",
    RebaseAbort = "RebaseAbort",
    RebaseContinue = "RebaseContinue",
    FindTrackingBranches = "GetTracking",
    Apply = "Apply",
    Blame = "Blame",
    Log = "Log",
    LogFile = "LogFile",

    Move = "Move",
}


export interface Operations {
    isIdle(): boolean;
    shouldShowProgress(): boolean;
    isRunning(operation: Operation): boolean;
}

export class OperationsImpl implements Operations {
    private operations = new Map<Operation, number>();

    start(operation: Operation): void {
        this.operations.set(operation, (this.operations.get(operation) || 0) + 1);
    }

    end(operation: Operation): void {
        const count = (this.operations.get(operation) || 0) - 1;

        if (count <= 0) {
            this.operations.delete(operation);
        } else {
            this.operations.set(operation, count);
        }
    }

    isRunning(operation: Operation): boolean {
        return this.operations.has(operation);
    }

    isIdle(): boolean {
        const operations = this.operations.keys();

        for (const operation of operations) {
            if (!isReadOnly(operation)) {
                return false;
            }
        }

        return true;
    }

    shouldShowProgress(): boolean {
        const operations = this.operations.keys();

        for (const operation of operations) {
            if (shouldShowProgress(operation)) {
                return true;
            }
        }

        return false;
    }
}
