import NAC from "node-abort-controller";
import type { CancellationToken } from "vscode";

export function fromCancellationToken(cancellationToken: CancellationToken): NAC.AbortSignal {
    const abortController = new NAC.AbortController();
    cancellationToken.onCancellationRequested(() => abortController.abort());
    if (cancellationToken.isCancellationRequested) {
        abortController.abort();
    }
    return abortController.signal;
}
