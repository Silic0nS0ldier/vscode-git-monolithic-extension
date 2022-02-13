import { isReadOnly } from "./isReadOnly.js";
import { Operation } from "./Operation.js";
import { shouldShowProgress } from "./shouldShowProgress.js";

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
