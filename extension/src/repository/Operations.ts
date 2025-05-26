import { UnreachableError } from "../util/unreachable-error.js";

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
        case Operation.HashObject:
        case Operation.GetBranches:
        case Operation.Status:
            return true;
        case Operation.Add:
        case Operation.Apply:
        case Operation.Branch:
        case Operation.Checkout:
        case Operation.CheckoutTracking:
        case Operation.CherryPick:
        case Operation.Clean:
        case Operation.Commit:
        case Operation.Config:// TODO Split to read and write variants
        case Operation.DeleteBranch:
        case Operation.DeleteRef:
        case Operation.DeleteTag:
        case Operation.Fetch:
        case Operation.Ignore:
        case Operation.Merge:
        case Operation.Move:
        case Operation.Pull:
        case Operation.Push:
        case Operation.Rebase:
        case Operation.RebaseAbort:
        case Operation.RebaseContinue:
        case Operation.Remote:
        case Operation.Remove:
        case Operation.RenameBranch:
        case Operation.Reset:
        case Operation.RevertFiles:
        case Operation.SetBranchUpstream:
        case Operation.Stage:
        case Operation.Tag:
        case Operation.Stash:
        case Operation.SubmoduleUpdate:
        case Operation.Sync:
            return false;
        default:
            throw new UnreachableError(operation);
    }
}

// TODO This could all use a review, I doubt so many should show progress
function shouldShowProgress(operation: OperationOptions): boolean {
    switch (operation) {
        case Operation.Fetch:
        case Operation.CheckIgnore:
        case Operation.GetObjectDetails:
        case Operation.Show:
            return false;
        case Operation.Blame:
        case Operation.Diff:
        case Operation.FindTrackingBranches:
        case Operation.GetBranch:
        case Operation.GetCommitTemplate:
        case Operation.Log:
        case Operation.LogFile:
        case Operation.MergeBase:
        case Operation.HashObject:
        case Operation.GetBranches:
        case Operation.Status:
        case Operation.Add:
        case Operation.Apply:
        case Operation.Branch:
        case Operation.Checkout:
        case Operation.CheckoutTracking:
        case Operation.CherryPick:
        case Operation.Clean:
        case Operation.Commit:
        case Operation.Config:
        case Operation.DeleteBranch:
        case Operation.DeleteRef:
        case Operation.DeleteTag:
        case Operation.Ignore:
        case Operation.Merge:
        case Operation.Move:
        case Operation.Pull:
        case Operation.Push:
        case Operation.Rebase:
        case Operation.RebaseAbort:
        case Operation.RebaseContinue:
        case Operation.Remote:
        case Operation.Remove:
        case Operation.RenameBranch:
        case Operation.Reset:
        case Operation.RevertFiles:
        case Operation.SetBranchUpstream:
        case Operation.Stage:
        case Operation.Tag:
        case Operation.Stash:
        case Operation.SubmoduleUpdate:
        case Operation.Sync:
            return true;
        default:
            throw new UnreachableError(operation);
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

export const Operation = {
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
} satisfies Record<OperationOptions, OperationOptions>;

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
            // TODO Consider refactoring, this is a hot-path and I'm not sure jumptables will reliably kick in here
            if (shouldShowProgress(operation)) {
                return true;
            }
        }

        return false;
    }
}
