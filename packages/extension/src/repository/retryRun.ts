import { GitErrorCodes } from "../api/git.js";
import { Operation } from "./Operations.js";
import { timeout } from "./timeout.js";

export async function retryRun<T>(
    operation: Operation,
    runOperation: () => Promise<T> = () => Promise.resolve<any>(null),
): Promise<T> {
    let attempt = 0;

    while (true) {
        try {
            attempt++;
            return await runOperation();
        } catch (err) {
            const shouldRetry = attempt <= 10 && (
                (err.gitErrorCode === GitErrorCodes.RepositoryIsLocked)
                || ((operation === Operation.Pull || operation === Operation.Sync || operation === Operation.Fetch)
                    && (err.gitErrorCode === GitErrorCodes.CantLockRef
                        || err.gitErrorCode === GitErrorCodes.CantRebaseMultipleBranches))
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
