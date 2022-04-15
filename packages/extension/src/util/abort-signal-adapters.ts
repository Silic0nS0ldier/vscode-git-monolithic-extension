import type { CancellationToken } from "vscode";

export function fromCancellationToken(cancellationToken: CancellationToken): AbortSignal {
    const abortController = new AbortController();
    cancellationToken.onCancellationRequested(() => abortController.abort());
    if (cancellationToken.isCancellationRequested) {
        abortController.abort();
    }
    return abortController.signal;
}
