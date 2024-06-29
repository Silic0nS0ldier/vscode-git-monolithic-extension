import { GitErrorCodes } from "../api/git.js";
import { GitError } from "../git/error.js";
import { timeout } from "../util/timeout.js";
import { Operation, type OperationOptions } from "./Operations.js";

function isOperationRetrySafe(err: GitError, operation: OperationOptions): boolean {
    return (operation === Operation.Pull || operation === Operation.Sync || operation === Operation.Fetch)
        && (
            err.gitErrorCode === GitErrorCodes.CantLockRef
            || err.gitErrorCode === GitErrorCodes.CantRebaseMultipleBranches
        );
}

export async function retryRun<T>(
    operation: OperationOptions,
    runOperation: () => Promise<T> = (): Promise<T> => Promise.resolve<any>(null),
): Promise<T> {
    let attempt = 0;

    while (true) {
        try {
            attempt++;
            return await runOperation();
        } catch (err) {
            const shouldRetry = err instanceof GitError && attempt <= 10 && (
                (err.gitErrorCode === GitErrorCodes.RepositoryIsLocked)
                || isOperationRetrySafe(err, operation)
            );

            if (shouldRetry) {
                // quatratic backoff
                await timeout(Math.pow(attempt, 2) * 50);
            } else {
                throw err;
            }
        }
    }
}
