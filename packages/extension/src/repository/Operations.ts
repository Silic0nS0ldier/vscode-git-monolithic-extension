import { isReadOnly } from "./isReadOnly.js";
import { shouldShowProgress } from "./shouldShowProgress.js";

export type OperationOptions =
    | "Status"
    | "Config"
    | "Diff"
    | "MergeBase"
    | "Add"
    | "Remove"
    | "RevertFiles"
    | "Commit"
    | "Clean"
    | "Branch"
    | "GetBranch"
    | "GetBranches"
    | "SetBranchUpstream"
    | "HashObject"
    | "Checkout"
    | "CheckoutTracking"
    | "Reset"
    | "Remote"
    | "Fetch"
    | "Pull"
    | "Push"
    | "CherryPick"
    | "Sync"
    | "Show"
    | "Stage"
    | "GetCommitTemplate"
    | "DeleteBranch"
    | "RenameBranch"
    | "DeleteRef"
    | "Merge"
    | "Rebase"
    | "Ignore"
    | "Tag"
    | "DeleteTag"
    | "Stash"
    | "CheckIgnore"
    | "GetObjectDetails"
    | "SubmoduleUpdate"
    | "RebaseAbort"
    | "RebaseContinue"
    | "FindTrackingBranches"
    | "Apply"
    | "Blame"
    | "Log"
    | "LogFile"
    | "Move";
export const Operation: Record<OperationOptions, OperationOptions> = {
    Status: "Status",
    Config: "Config",
    Diff: "Diff",
    MergeBase: "MergeBase",
    Add: "Add",
    Remove: "Remove",
    RevertFiles: "RevertFiles",
    Commit: "Commit",
    Clean: "Clean",
    Branch: "Branch",
    GetBranch: "GetBranch",
    GetBranches: "GetBranches",
    SetBranchUpstream: "SetBranchUpstream",
    HashObject: "HashObject",
    Checkout: "Checkout",
    CheckoutTracking: "CheckoutTracking",
    Reset: "Reset",
    Remote: "Remote",
    Fetch: "Fetch",
    Pull: "Pull",
    Push: "Push",
    CherryPick: "CherryPick",
    Sync: "Sync",
    Show: "Show",
    Stage: "Stage",
    GetCommitTemplate: "GetCommitTemplate",
    DeleteBranch: "DeleteBranch",
    RenameBranch: "RenameBranch",
    DeleteRef: "DeleteRef",
    Merge: "Merge",
    Rebase: "Rebase",
    Ignore: "Ignore",
    Tag: "Tag",
    DeleteTag: "DeleteTag",
    Stash: "Stash",
    CheckIgnore: "CheckIgnore",
    GetObjectDetails: "GetObjectDetails",
    SubmoduleUpdate: "SubmoduleUpdate",
    RebaseAbort: "RebaseAbort",
    RebaseContinue: "RebaseContinue",
    FindTrackingBranches: "FindTrackingBranches",
    Apply: "Apply",
    Blame: "Blame",
    Log: "Log",
    LogFile: "LogFile",
    Move: "Move",
};

export interface Operations {
    isIdle(): boolean;
    shouldShowProgress(): boolean;
    isRunning(operation: OperationOptions): boolean;
}

export class OperationsImpl implements Operations {
    private operations = new Map<OperationOptions, number>();

    start(operation: OperationOptions): void {
        this.operations.set(operation, (this.operations.get(operation) || 0) + 1);
    }

    end(operation: OperationOptions): void {
        const count = (this.operations.get(operation) || 0) - 1;

        if (count <= 0) {
            this.operations.delete(operation);
        } else {
            this.operations.set(operation, count);
        }
    }

    isRunning(operation: OperationOptions): boolean {
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
