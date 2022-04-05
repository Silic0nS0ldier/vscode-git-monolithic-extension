import { Operation, OperationOptions } from "./Operations.js";

export function shouldShowProgress(operation: OperationOptions): boolean {
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
