import { Operation } from "./Operations.js";

export function shouldShowProgress(operation: Operation): boolean {
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
