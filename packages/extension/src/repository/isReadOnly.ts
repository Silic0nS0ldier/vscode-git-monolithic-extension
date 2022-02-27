import { Operation } from "./Operations.js";

export function isReadOnly(operation: Operation): boolean {
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
